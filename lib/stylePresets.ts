import type { NodeStyle } from "@/types/mindmap";

export const japaneseFontOptions = [
  { label: "Noto Sans JP", value: '"Noto Sans JP", "Yu Gothic", sans-serif' },
  { label: "Noto Serif JP", value: '"Noto Serif JP", "Hiragino Mincho ProN", serif' },
  { label: "M PLUS 1p", value: '"M PLUS 1p", "Yu Gothic", sans-serif' },
  { label: "M PLUS Rounded 1c", value: '"M PLUS Rounded 1c", "Yu Gothic", sans-serif' },
  { label: "Zen Kaku Gothic New", value: '"Zen Kaku Gothic New", "Yu Gothic", sans-serif' },
  { label: "Zen Maru Gothic", value: '"Zen Maru Gothic", "Yu Gothic", sans-serif' },
  { label: "Kosugi", value: '"Kosugi", "Yu Gothic", sans-serif' },
  { label: "Kosugi Maru", value: '"Kosugi Maru", "Yu Gothic", sans-serif' },
  { label: "Sawarabi Gothic", value: '"Sawarabi Gothic", "Yu Gothic", sans-serif' },
  { label: "Sawarabi Mincho", value: '"Sawarabi Mincho", "Hiragino Mincho ProN", serif' },
  { label: "Yu Gothic", value: '"Yu Gothic", "YuGothic", sans-serif' },
  { label: "Hiragino Kaku Gothic ProN", value: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' },
  { label: "Hiragino Mincho ProN", value: '"Hiragino Mincho ProN", "Yu Mincho", serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Courier New", value: '"Courier New", monospace' },
];

export const defaultNodeStyle: NodeStyle = {
  fontFamily: japaneseFontOptions[0].value,
  fontSize: 16,
  fontWeight: 600,
  italic: false,
  underline: false,
  strike: false,
  textColor: "#0f172a",
  textOpacity: 1,
  textAlign: "center",
  lineHeight: 1.35,
  letterSpacing: 0,
  writingMode: "horizontal",
  textTransform: "none",
  shape: "rounded",
  borderStyle: "solid",
  borderColor: "#2563eb",
  borderWidth: 2,
  borderOpacity: 1,
  borderRadius: 18,
  borderTopWidth: 2,
  borderRightWidth: 2,
  borderBottomWidth: 2,
  borderLeftWidth: 2,
  borderPosition: "center",
  backgroundMode: "solid",
  backgroundColor: "#ffffff",
  backgroundOpacity: 1,
  gradientFrom: "#eff6ff",
  gradientTo: "#dcfce7",
  gradientDirection: "horizontal",
  shadowEnabled: true,
  shadowColor: "#0f172a",
  shadowOpacity: 0.12,
  shadowBlur: 16,
  shadowX: 0,
  shadowY: 8,
  autoSize: true,
  minWidth: 188,
  minHeight: 72,
  paddingTop: 14,
  paddingRight: 16,
  paddingBottom: 14,
  paddingLeft: 16,
  siblingSpacing: 130,
  emphasis: false,
};

export const stylePresets: Array<{ name: string; style: Partial<NodeStyle> }> = [
  {
    name: "シンプル",
    style: {
      fontFamily: japaneseFontOptions[0].value,
      fontWeight: 600,
      textColor: "#0f172a",
      backgroundColor: "#ffffff",
      borderColor: "#2563eb",
      borderStyle: "solid",
      shape: "rounded",
      shadowEnabled: true,
    },
  },
  {
    name: "ビジネス",
    style: {
      fontFamily: '"Noto Sans JP", "Yu Gothic", sans-serif',
      textColor: "#0f172a",
      backgroundColor: "#f8fafc",
      borderColor: "#0f766e",
      shape: "rounded",
      borderRadius: 10,
      shadowOpacity: 0.08,
    },
  },
  {
    name: "カラフル",
    style: {
      backgroundMode: "gradient",
      gradientFrom: "#dbeafe",
      gradientTo: "#bbf7d0",
      gradientDirection: "diagonal",
      borderColor: "#06b6d4",
      textColor: "#0f172a",
      shape: "capsule",
    },
  },
  {
    name: "ナチュラル",
    style: {
      backgroundColor: "#f0fdf4",
      borderColor: "#65a30d",
      textColor: "#14532d",
      shape: "sticky",
      shadowColor: "#365314",
      shadowOpacity: 0.1,
    },
  },
  {
    name: "モダン",
    style: {
      backgroundColor: "#ecfeff",
      borderColor: "#0891b2",
      textColor: "#164e63",
      shape: "hexagon",
      fontWeight: 700,
      shadowBlur: 20,
    },
  },
  {
    name: "ポップ",
    style: {
      fontFamily: '"M PLUS Rounded 1c", "Zen Maru Gothic", sans-serif',
      backgroundColor: "#fef3c7",
      borderColor: "#f59e0b",
      textColor: "#78350f",
      shape: "speech",
      fontSize: 17,
    },
  },
  {
    name: "和風",
    style: {
      fontFamily: '"Noto Serif JP", "Hiragino Mincho ProN", serif',
      backgroundColor: "#fff7ed",
      borderColor: "#0f766e",
      textColor: "#1f2937",
      shape: "rounded",
      borderStyle: "double",
    },
  },
  {
    name: "高級感",
    style: {
      backgroundColor: "#111827",
      borderColor: "#d4af37",
      textColor: "#f8fafc",
      shadowColor: "#000000",
      shadowOpacity: 0.26,
      shape: "ellipse",
    },
  },
  {
    name: "ダーク",
    style: {
      backgroundColor: "#0f172a",
      borderColor: "#38bdf8",
      textColor: "#e0f2fe",
      shadowColor: "#000000",
      shadowOpacity: 0.25,
      shape: "rounded",
    },
  },
  {
    name: "パステル",
    style: {
      backgroundMode: "gradient",
      gradientFrom: "#e0f2fe",
      gradientTo: "#dcfce7",
      gradientDirection: "vertical",
      borderColor: "#7dd3fc",
      textColor: "#0f172a",
      shape: "capsule",
    },
  },
];

export function normalizeStyle(input?: Partial<NodeStyle>, legacyColor?: string): NodeStyle {
  const next = { ...defaultNodeStyle, ...(input ?? {}) };
  if (!input?.borderColor && legacyColor) {
    next.borderColor = legacyColor;
  }
  next.fontSize = clampNumber(next.fontSize, 10, 48);
  next.textOpacity = clampNumber(next.textOpacity, 0, 1);
  next.borderWidth = clampNumber(next.borderWidth, 0, 12);
  next.borderOpacity = clampNumber(next.borderOpacity, 0, 1);
  next.borderRadius = clampNumber(next.borderRadius, 0, 100);
  next.borderTopWidth = clampNumber(next.borderTopWidth, 0, 12);
  next.borderRightWidth = clampNumber(next.borderRightWidth, 0, 12);
  next.borderBottomWidth = clampNumber(next.borderBottomWidth, 0, 12);
  next.borderLeftWidth = clampNumber(next.borderLeftWidth, 0, 12);
  next.backgroundOpacity = clampNumber(next.backgroundOpacity, 0, 1);
  next.shadowOpacity = clampNumber(next.shadowOpacity, 0, 1);
  next.shadowBlur = clampNumber(next.shadowBlur, 0, 60);
  next.minWidth = clampNumber(next.minWidth, 96, 420);
  next.minHeight = clampNumber(next.minHeight, 48, 280);
  next.paddingTop = clampNumber(next.paddingTop, 4, 48);
  next.paddingRight = clampNumber(next.paddingRight, 4, 48);
  next.paddingBottom = clampNumber(next.paddingBottom, 4, 48);
  next.paddingLeft = clampNumber(next.paddingLeft, 4, 48);
  next.siblingSpacing = clampNumber(next.siblingSpacing, 80, 260);
  return next;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
