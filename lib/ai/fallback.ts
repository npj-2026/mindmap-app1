import type { GeneratedMindMap, GeneratedMindMapNode } from "@/types/mindmap";
import { generationMethodLabels, type DocumentGenerationOptions, type ExtractedDocument } from "@/lib/ai/types";
import { validateGeneratedMap } from "@/lib/ai/validate";

type OutlineItem = {
  level: number;
  title: string;
  paragraph: string;
  index: number;
};

export function generateFallbackMap(document: ExtractedDocument, options: DocumentGenerationOptions): GeneratedMindMap {
  const outline = outlineFromText(document.text);
  const title = inferTitle(document.text, document.name);
  const nodes =
    outline.length >= 1
      ? buildFromOutline(outline, options)
      : buildFromParagraphs(document.text, options);
  const raw = {
    title,
    summary: summarizeParagraph(document.text, options.detail === "deep" ? 360 : 220),
    sourceName: document.name,
    children: nodes,
  };

  return validateGeneratedMap(raw, {
    sourceName: document.name,
    method: generationMethodLabels[options.method],
    aiUsed: false,
    maxDepth: options.maxDepth,
    maxTopLevel: options.maxTopLevel,
    maxChildren: options.maxChildren,
  }).map;
}

export function hasMarkdownOutline(text: string) {
  const headings = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+\S/.test(line));
  return headings.some((line) => /^#{2,6}\s+\S/.test(line));
}

function outlineFromText(text: string) {
  const lines = text.split("\n");
  const items: OutlineItem[] = [];
  let paragraph = "";
  let paragraphIndex = 1;

  lines.forEach((rawLine) => {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      if (paragraph) paragraphIndex += 1;
      paragraph = "";
      return;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    const bulletMatch = rawLine.match(/^(\s*)([-*・●○]|[0-9０-９]+[.)．、])\s+(.+)$/);
    const numberedHeading = trimmedLine.match(/^([第]?\d+|[第]?[一二三四五六七八九十]+)[章部節項]\s*[：:、.．]?\s*(.+)$/);

    if (headingMatch) {
      const markdownLevel = headingMatch[1].length;
      if (markdownLevel === 1) {
        paragraph = "";
        return;
      }
      items.push({
        level: Math.min(5, markdownLevel - 1),
        title: cleanTitle(headingMatch[2]),
        paragraph: trimmedLine,
        index: paragraphIndex,
      });
      paragraph = trimmedLine;
    } else if (bulletMatch) {
      const indent = Math.floor((bulletMatch[1]?.length ?? 0) / 2);
      items.push({
        level: Math.min(5, indent + 1),
        title: cleanTitle(bulletMatch[3]),
        paragraph: trimmedLine,
        index: paragraphIndex,
      });
      paragraph = trimmedLine;
    } else if (numberedHeading) {
      items.push({
        level: 1,
        title: cleanTitle(numberedHeading[2]),
        paragraph: trimmedLine,
        index: paragraphIndex,
      });
      paragraph = trimmedLine;
    } else {
      paragraph = paragraph ? `${paragraph} ${trimmedLine}` : trimmedLine;
      const lastItem = items[items.length - 1];
      if (lastItem) {
        lastItem.paragraph = `${lastItem.paragraph} ${trimmedLine}`.trim();
      }
    }
  });

  return items;
}

function buildFromOutline(outline: OutlineItem[], options: DocumentGenerationOptions) {
  const rootItems: GeneratedMindMapNode[] = [];
  const stack: Array<{ level: number; node: GeneratedMindMapNode }> = [];

  for (const item of outline) {
    const normalizedLevel = Math.min(options.maxDepth - 1, Math.max(1, item.level));
    const node: GeneratedMindMapNode = {
      title: item.title,
      summary: summarizeParagraph(item.paragraph),
      sourceExcerpt: item.paragraph.slice(0, 420),
      sourceLocation: `段落${item.index}`,
      importance: normalizedLevel === 1 ? "high" : normalizedLevel === 2 ? "medium" : "low",
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= normalizedLevel) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.node;
    const siblings = parent ? parent.children : rootItems;
    if (siblings.length < (parent ? options.maxChildren : options.maxTopLevel)) {
      siblings.push(node);
      stack.push({ level: normalizedLevel, node });
    }
  }

  return rootItems;
}

function buildFromParagraphs(text: string, options: DocumentGenerationOptions) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 20);
  const selected = dedupeStrings(paragraphs).slice(0, options.maxTopLevel);

  return selected.map((paragraph, index): GeneratedMindMapNode => {
    const sentences = paragraph
      .split(/[。.!?！？]\s*/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8)
      .slice(1, options.maxChildren + 1);
    return {
      title: cleanTitle(paragraph),
      summary: summarizeParagraph(paragraph),
      sourceExcerpt: paragraph.slice(0, 420),
      sourceLocation: `段落${index + 1}`,
      importance: index < 3 ? "high" : "medium",
      children:
        options.maxDepth > 2
          ? sentences.map((sentence, childIndex) => ({
              title: cleanTitle(sentence),
              summary: sentence.slice(0, 180),
              sourceExcerpt: sentence,
              sourceLocation: `段落${index + 1}-${childIndex + 1}`,
              importance: "low",
              children: [],
            }))
          : [],
    };
  });
}

function inferTitle(text: string, documentName: string) {
  const markdownHeading = text.match(/^#\s+(.+)$/m)?.[1];
  if (markdownHeading) return cleanTitle(markdownHeading, 64);
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 4 && line.length <= 80 && !line.startsWith("#"));
  return cleanTitle(firstLine || documentName.replace(/\.[^.]+$/, ""), 64);
}

function cleanTitle(text: string, limit = 42) {
  return text
    .replace(/^[-*・●○#\s\d０-９.)．、]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit) || "項目";
}

function summarizeParagraph(text: string, limit = 180) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1)}…`;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.slice(0, 80).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
