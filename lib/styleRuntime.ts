import type { CSSProperties } from "react";
import type { MindNode, NodeShape, NodeStyle } from "@/types/mindmap";
import { normalizeStyle } from "@/lib/stylePresets";

export function nodeOuterStyle(node: MindNode): CSSProperties {
  const style = normalizeStyle(node.style, node.color);
  const autoSize = style.autoSize;
  const paddingTop = autoSize ? Math.min(style.paddingTop, 8) : style.paddingTop;
  const paddingRight = autoSize ? Math.min(style.paddingRight, 10) : style.paddingRight;
  const paddingBottom = autoSize ? Math.min(style.paddingBottom, 8) : style.paddingBottom;
  const paddingLeft = autoSize ? Math.min(style.paddingLeft, 10) : style.paddingLeft;
  return {
    left: node.x,
    top: node.y,
    width: autoSize ? "max-content" : node.width,
    minWidth: autoSize ? Math.min(style.minWidth, 120) : style.minWidth,
    minHeight: autoSize ? Math.min(style.minHeight, 44) : style.minHeight,
    borderColor: hexToRgba(style.borderColor, style.borderOpacity),
    borderStyle: borderCssStyle(style.borderStyle),
    borderWidth: borderWidth(style),
    borderRadius: radiusForShape(style.shape, autoSize ? Math.min(style.borderRadius, 10) : style.borderRadius),
    background: backgroundCss(style),
    opacity: 1,
    boxShadow: shadowCss(style),
    clipPath: clipPathForShape(style.shape),
    padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
  };
}

export function nodeTextStyle(style: NodeStyle): CSSProperties {
  const normalized = normalizeStyle(style);
  return {
    color: hexToRgba(normalized.textColor, normalized.textOpacity),
    fontFamily: normalized.fontFamily,
    fontSize: normalized.fontSize,
    fontWeight: normalized.fontWeight,
    fontStyle: normalized.italic ? "italic" : "normal",
    textDecoration: [normalized.underline ? "underline" : "", normalized.strike ? "line-through" : ""]
      .filter(Boolean)
      .join(" "),
    textAlign: normalized.textAlign,
    lineHeight: normalized.lineHeight,
    letterSpacing: normalized.letterSpacing,
    whiteSpace: "pre",
    wordBreak: "keep-all",
    overflowWrap: "normal",
    writingMode: normalized.writingMode === "vertical" ? "vertical-rl" : "horizontal-tb",
    textTransform: normalized.textTransform === "none" ? "none" : normalized.textTransform,
  };
}

export function backgroundCss(style: NodeStyle) {
  const normalized = normalizeStyle(style);
  if (normalized.backgroundMode === "none") return "transparent";
  if (normalized.backgroundMode === "gradient") {
    const from = hexToRgba(normalized.gradientFrom, normalized.backgroundOpacity);
    const to = hexToRgba(normalized.gradientTo, normalized.backgroundOpacity);
    if (normalized.gradientDirection === "radial") return `radial-gradient(circle, ${from}, ${to})`;
    if (normalized.gradientDirection === "vertical") return `linear-gradient(180deg, ${from}, ${to})`;
    if (normalized.gradientDirection === "diagonal") return `linear-gradient(135deg, ${from}, ${to})`;
    return `linear-gradient(90deg, ${from}, ${to})`;
  }
  return hexToRgba(normalized.backgroundColor, normalized.backgroundOpacity);
}

export function borderCssStyle(style: NodeStyle["borderStyle"]) {
  if (style === "none") return "none";
  if (style === "heavy") return "solid";
  return style;
}

export function borderWidth(style: NodeStyle) {
  const width = style.borderStyle === "none" ? 0 : style.borderStyle === "heavy" ? Math.max(6, style.borderWidth) : style.borderWidth;
  return `${style.borderTopWidth ?? width}px ${style.borderRightWidth ?? width}px ${style.borderBottomWidth ?? width}px ${style.borderLeftWidth ?? width}px`;
}

export function radiusForShape(shape: NodeShape, radius: number) {
  if (shape === "rectangle" || shape === "diamond" || shape === "hexagon" || shape === "sticky") return 0;
  if (shape === "capsule" || shape === "circle" || shape === "ellipse") return 999;
  if (shape === "underline" || shape === "none") return 0;
  return radius;
}

export function clipPathForShape(shape: NodeShape) {
  if (shape === "diamond") return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
  if (shape === "hexagon") return "polygon(18% 0%, 82% 0%, 100% 50%, 82% 100%, 18% 100%, 0% 50%)";
  if (shape === "speech") return "polygon(0 0, 100% 0, 100% 82%, 68% 82%, 58% 100%, 48% 82%, 0 82%)";
  if (shape === "sticky") return "polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)";
  return undefined;
}

export function shadowCss(style: NodeStyle) {
  const normalized = normalizeStyle(style);
  if (!normalized.shadowEnabled) return "none";
  return `${normalized.shadowX}px ${normalized.shadowY}px ${normalized.shadowBlur}px ${hexToRgba(
    normalized.shadowColor,
    normalized.shadowOpacity,
  )}`;
}

export function readableTextColor(background: string) {
  const { r, g, b } = hexToRgb(background);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}

export function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

export function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").trim();
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}
