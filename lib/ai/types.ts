import type { DocumentGenerationMethod, GeneratedMindMap, GeneratedMindMapNode } from "@/types/mindmap";

export type DocumentInputKind = "text" | "file" | "url";

export type DocumentGenerationOptions = {
  method: DocumentGenerationMethod;
  detail: "short" | "normal" | "deep";
  maxDepth: number;
  maxTopLevel: number;
  maxChildren: number;
  customInstruction: string;
};

export type ExtractedDocument = {
  name: string;
  text: string;
  kind: DocumentInputKind;
};

export type GenerationResponse = {
  map: GeneratedMindMap;
  aiConfigured: boolean;
  warning?: string;
};

export type ValidationResult = {
  map: GeneratedMindMap;
  warnings: string[];
};

export type GeneratedNodeInput = Omit<GeneratedMindMapNode, "children"> & {
  children?: GeneratedNodeInput[];
};

export const generationMethodLabels: Record<DocumentGenerationMethod, string> = {
  brief: "簡潔に要約",
  detailed: "詳しく要約",
  "key-points": "重要ポイントを抽出",
  meeting: "会議資料として整理",
  "business-plan": "事業計画として整理",
  "problems-solutions": "課題と解決策に整理",
  timeline: "時系列で整理",
  custom: "自由形式で指示",
};
