import { inflateRawSync, inflateSync } from "node:zlib";
import type { ExtractedDocument } from "@/lib/ai/types";

export const maxUploadBytes = 10 * 1024 * 1024;
const maxUrlBytes = 2 * 1024 * 1024;

export function safeDocumentName(name: string) {
  return (name || "資料")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "資料";
}

export function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractFromFile(file: File): Promise<ExtractedDocument> {
  if (file.size > maxUploadBytes) {
    throw new Error("ファイルサイズが大きすぎます。10MB以下の資料を選択してください。");
  }

  const name = safeDocumentName(file.name);
  const lowerName = name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  if (file.type === "text/plain" || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    text = buffer.toString("utf8");
  } else if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    text = extractPdfText(buffer);
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    text = extractDocxText(buffer);
  } else {
    throw new Error("対応していないファイル形式です。TXT、PDF、Word（.docx）を選択してください。");
  }

  const cleaned = cleanExtractedText(text);
  if (cleaned.length < 12) {
    throw new Error("資料から十分なテキストを抽出できませんでした。テキストを貼り付けて試してください。");
  }

  return { name, text: cleaned, kind: "file" };
}

export async function extractFromUrl(rawUrl: string): Promise<ExtractedDocument> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URLの形式が正しくありません。");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("httpまたはhttpsのURLを入力してください。");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("安全のため、このURLは読み込めません。公開されているWebページを指定してください。");
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      Accept: "text/html,text/plain,application/xhtml+xml",
      "User-Agent": "MindMapDocumentImporter/1.0",
    },
  });
  if (!response.ok) {
    throw new Error("Webページを読み込めませんでした。URLを確認してください。");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxUrlBytes) {
    throw new Error("Webページが大きすぎます。本文を貼り付けてください。");
  }

  const html = (await response.text()).slice(0, maxUrlBytes);
  const text = cleanExtractedText(htmlToText(html));
  if (text.length < 12) {
    throw new Error("Webページから本文を抽出できませんでした。必要な文章を貼り付けてください。");
  }

  return {
    name: safeDocumentName(parsed.hostname + parsed.pathname),
    text,
    kind: "url",
  };
}

export function extractFromText(text: string, name = "貼り付けテキスト"): ExtractedDocument {
  const cleaned = cleanExtractedText(text);
  if (cleaned.length < 12) {
    throw new Error("資料として使う文章をもう少し入力してください。");
  }
  return { name: safeDocumentName(name), text: cleaned, kind: "text" };
}

function htmlToText(html: string) {
  const withoutUnsafe = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutUnsafe
    .replace(/<\/(h[1-6]|p|li|tr|section|article|div)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n");
  return decodeHtml(withBreaks.replace(/<[^>]+>/g, " "));
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function extractDocxText(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const document = entries.get("word/document.xml");
  if (!document) {
    throw new Error("Wordファイルの本文を読み取れませんでした。");
  }

  return document
    .toString("utf8")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    if (compression === 0) {
      entries.set(name, data);
    } else if (compression === 8) {
      const inflated = inflateRawSync(data);
      entries.set(name, uncompressedSize ? inflated.subarray(0, uncompressedSize) : inflated);
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

function extractPdfText(buffer: Buffer) {
  const chunks: string[] = [];
  const raw = buffer.toString("latin1");
  chunks.push(extractPdfTextOperators(raw));

  const streamRegex = /<<(?:.|\n|\r)*?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw))) {
    const fullMatch = match[0];
    const streamData = Buffer.from(match[1], "latin1");
    const isFlate = /\/Filter\s*\/FlateDecode/.test(fullMatch);
    try {
      const decoded = isFlate ? inflateSync(streamData).toString("latin1") : streamData.toString("latin1");
      chunks.push(extractPdfTextOperators(decoded));
    } catch {
      // Complex PDF streams are ignored; other streams may still contain usable text.
    }
  }

  return chunks.join("\n");
}

function extractPdfTextOperators(content: string) {
  const results: string[] = [];
  const literal = /\(((?:\\.|[^\\)])*)\)\s*T[jJ]/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(content))) {
    results.push(decodePdfString(match[1]));
  }

  const arrayText = /\[((?:.|\n|\r)*?)\]\s*TJ/g;
  while ((match = arrayText.exec(content))) {
    const pieces: string[] = [];
    const stringRegex = /\(((?:\\.|[^\\)])*)\)/g;
    let stringMatch: RegExpExecArray | null;
    while ((stringMatch = stringRegex.exec(match[1]))) {
      pieces.push(decodePdfString(stringMatch[1]));
    }
    if (pieces.length) results.push(pieces.join(""));
  }

  return results.join("\n");
}

function decodePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}
