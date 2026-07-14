import { NextResponse } from "next/server";
import {
  extractFromFile,
  extractFromText,
  extractFromUrl,
  maxUploadBytes,
} from "@/lib/ai/extract";
import { generateMindMapFromDocument } from "@/lib/ai/provider";
import type { DocumentGenerationMethod } from "@/types/mindmap";
import type { DocumentGenerationOptions, ExtractedDocument } from "@/lib/ai/types";

export const runtime = "nodejs";

const allowedMethods = new Set<DocumentGenerationMethod>([
  "brief",
  "detailed",
  "key-points",
  "meeting",
  "business-plan",
  "problems-solutions",
  "timeline",
  "custom",
]);

function numberOption(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(typeof value === "string" ? value : "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function stringOption(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function detailOption(value: string): DocumentGenerationOptions["detail"] {
  return value === "short" || value === "deep" ? value : "normal";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const methodValue = stringOption(formData.get("method")) as DocumentGenerationMethod;
    const method = allowedMethods.has(methodValue) ? methodValue : "brief";
    const options: DocumentGenerationOptions = {
      method,
      detail: detailOption(stringOption(formData.get("detail"))),
      maxDepth: numberOption(formData.get("maxDepth"), 4, 2, 4),
      maxTopLevel: numberOption(formData.get("maxTopLevel"), 8, 1, 12),
      maxChildren: numberOption(formData.get("maxChildren"), 8, 1, 12),
      customInstruction: stringOption(formData.get("customInstruction")).slice(0, 500),
    };

    const document = await readDocument(formData);
    const generated = await generateMindMapFromDocument(document, options);

    return NextResponse.json(
      {
        ...generated,
        sourceText: document.text.slice(0, 20000),
        sourceName: document.name,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "資料からマップを作成できませんでした。";
    return NextResponse.json(
      { error: "generation_failed", message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function readDocument(formData: FormData): Promise<ExtractedDocument> {
  const inputKind = stringOption(formData.get("inputKind"));
  const text = stringOption(formData.get("text"));
  const url = stringOption(formData.get("url"));
  const file = formData.get("file");

  if (inputKind === "file" || file instanceof File) {
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("ファイルを選択してください。");
    }
    if (file.size > maxUploadBytes) {
      throw new Error("ファイルサイズが大きすぎます。10MB以下の資料を選択してください。");
    }
    return extractFromFile(file);
  }

  if (inputKind === "url" || url) {
    if (!url) throw new Error("URLを入力してください。");
    return extractFromUrl(url);
  }

  return extractFromText(text);
}
