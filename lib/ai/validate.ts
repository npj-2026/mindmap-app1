import type { GeneratedMindMap, GeneratedMindMapNode } from "@/types/mindmap";
import type { GeneratedNodeInput, ValidationResult } from "@/lib/ai/types";

const maxTotalNodes = 260;

function cleanText(value: unknown, fallback: string, limit = 120) {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, limit) || fallback;
}

function cleanLongText(value: unknown, fallback = "", limit = 600) {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function importance(value: unknown): GeneratedMindMapNode["importance"] {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

export function validateGeneratedMap(
  raw: unknown,
  options: { sourceName: string; method: string; aiUsed: boolean; maxDepth: number; maxTopLevel: number; maxChildren: number },
): ValidationResult {
  const warnings: string[] = [];
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = cleanText(source.title, "資料から作成", 80);
  const summary = cleanLongText(source.summary, "", 900);
  const childrenInput = Array.isArray(source.children) ? source.children : [];
  if (!Array.isArray(source.children)) {
    warnings.push("生成結果に項目がなかったため、本文から項目を作成しました。");
  }

  let count = 0;
  const children = childrenInput
    .slice(0, options.maxTopLevel)
    .map((child) => normalizeNode(child as GeneratedNodeInput, 1, options, () => {
      count += 1;
      return count;
    }))
    .filter((node): node is GeneratedMindMapNode => Boolean(node));

  if (childrenInput.length > options.maxTopLevel) {
    warnings.push(`大項目が多かったため、先頭${options.maxTopLevel}件に整理しました。`);
  }
  if (count > maxTotalNodes) {
    warnings.push("ノード数が多すぎたため、一部を省略しました。");
  }

  const map: GeneratedMindMap = {
    title,
    summary,
    sourceName: cleanText(source.sourceName, options.sourceName, 120),
    aiUsed: options.aiUsed,
    method: options.method,
    children,
  };

  return { map, warnings };
}

function normalizeNode(
  raw: GeneratedNodeInput,
  depth: number,
  options: { maxDepth: number; maxChildren: number },
  nextCount: () => number,
): GeneratedMindMapNode | null {
  const total = nextCount();
  if (total > maxTotalNodes) return null;
  const source = raw && typeof raw === "object" ? raw : ({} as GeneratedNodeInput);
  const title = cleanText(source.title, "", 80);
  if (!title) return null;
  const childInput = Array.isArray(source.children) ? source.children : [];
  const childLimit = depth >= options.maxDepth - 1 ? 0 : options.maxChildren;
  const children = childInput
    .slice(0, childLimit)
    .map((child) => normalizeNode(child, depth + 1, options, nextCount))
    .filter((node): node is GeneratedMindMapNode => Boolean(node));

  return {
    id: typeof source.id === "string" ? source.id : undefined,
    title,
    summary: cleanLongText(source.summary),
    sourceExcerpt: cleanLongText(source.sourceExcerpt, "", 500),
    sourceLocation: cleanText(source.sourceLocation, `段落${total}`, 80),
    importance: importance(source.importance),
    children,
  };
}

export function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AIの応答からJSONを読み取れませんでした。");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}
