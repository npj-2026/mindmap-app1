import { generateFallbackMap, hasMarkdownOutline } from "@/lib/ai/fallback";
import { extractJsonObject, validateGeneratedMap } from "@/lib/ai/validate";
import { generationMethodLabels, type DocumentGenerationOptions, type ExtractedDocument, type GenerationResponse } from "@/lib/ai/types";

const maxAiChars = 42000;

export async function generateMindMapFromDocument(
  document: ExtractedDocument,
  options: DocumentGenerationOptions,
): Promise<GenerationResponse> {
  const apiKey = process.env.AI_API_KEY;
  if (hasMarkdownOutline(document.text)) {
    return {
      map: generateFallbackMap(document, options),
      aiConfigured: Boolean(apiKey),
      warning: apiKey ? undefined : "AI要約を利用するにはAPI設定が必要です。Markdown構造を優先して作成しました。",
    };
  }

  if (!apiKey) {
    return {
      map: generateFallbackMap(document, options),
      aiConfigured: false,
      warning: "AI要約を利用するにはAPI設定が必要です。簡易抽出で作成しました。",
    };
  }

  try {
    const raw = await generateWithOpenAiCompatibleApi(document, options, apiKey);
    const validated = validateGeneratedMap(raw, {
      sourceName: document.name,
      method: generationMethodLabels[options.method],
      aiUsed: true,
      maxDepth: options.maxDepth,
      maxTopLevel: options.maxTopLevel,
      maxChildren: options.maxChildren,
    });
    return {
      map: validated.map,
      aiConfigured: true,
      warning: validated.warnings[0],
    };
  } catch {
    return {
      map: generateFallbackMap(document, options),
      aiConfigured: true,
      warning: "AI要約に失敗したため、簡易抽出で作成しました。",
    };
  }
}

async function generateWithOpenAiCompatibleApi(
  document: ExtractedDocument,
  options: DocumentGenerationOptions,
  apiKey: string,
) {
  const endpoint = process.env.AI_API_BASE_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const chunks = chunkText(document.text, maxAiChars);
  const sourceText = chunks
    .map((chunk, index) => `--- 分割${index + 1} ---\n${chunk}`)
    .join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "あなたは日本語資料をマインドマップ用の構造化JSONへ整理するアシスタントです。説明文ではなく、指定スキーマに合うJSONオブジェクトだけを返してください。",
        },
        {
          role: "user",
          content: buildPrompt(document, options, sourceText),
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error("AI API request failed");
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI response was empty");
  }
  return extractJsonObject(content);
}

function buildPrompt(document: ExtractedDocument, options: DocumentGenerationOptions, sourceText: string) {
  return [
    `資料名: ${document.name}`,
    `作成方法: ${generationMethodLabels[options.method]}`,
    `要約の詳しさ: ${options.detail}`,
    `最大階層: ${options.maxDepth}（第1階層の中心テーマを含む。最大6階層まで）`,
    `大項目の最大数: ${options.maxTopLevel}`,
    `各項目の子項目の最大数: ${options.maxChildren}`,
    options.customInstruction ? `追加指示: ${options.customInstruction}` : "",
    "",
    "階層定義: 第1階層=中心テーマ、 第2階層=大項目、 第3階層=中項目、 第4階層=小項目、 第5階層=詳細項目、 第6階層=具体的内容・施策。",
    "Markdown見出しは # を中心テーマ、## を大項目、### を中項目、#### を小項目、##### を詳細項目、###### を具体的内容として扱ってください。",
    "必ず次のJSON形式で返してください。childrenは最大階層を超えないようにし、第5・第6階層も説明文だけにせずchildren内のノードとして返してください。",
    `{
  "title": "中心テーマ",
  "summary": "資料全体の要約",
  "children": [
    {
      "title": "大項目",
      "summary": "短い説明",
      "sourceExcerpt": "根拠にした短い引用",
      "sourceLocation": "ページ番号または段落番号",
      "importance": "high",
      "children": []
    }
  ]
}`,
    "",
    "同じ内容を重複してノード化しないでください。見出し、章、段落の構造を優先してください。",
    "資料本文:",
    sourceText,
  ]
    .filter(Boolean)
    .join("\n");
}

function chunkText(text: string, size: number) {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length && chunks.length < 8) {
    const slice = text.slice(offset, offset + size);
    const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("。"));
    const end = breakAt > size * 0.55 ? offset + breakAt + 1 : offset + slice.length;
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
}
