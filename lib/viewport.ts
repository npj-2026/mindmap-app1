import type { MindNode } from "@/types/mindmap";

export type ViewportTransform = {
  x: number;
  y: number;
  scale: number;
};

export type ViewportRect = {
  width: number;
  height: number;
};

export type ViewportPoint = {
  x: number;
  y: number;
};

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 0.1;

export function clampZoom(value: number) {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 1000) / 1000;
}

export function zoomTransformAtPoint(
  current: ViewportTransform,
  nextScaleValue: number,
  point: ViewportPoint,
): ViewportTransform {
  const nextScale = clampZoom(nextScaleValue);
  const worldX = (point.x - current.x) / current.scale;
  const worldY = (point.y - current.y) / current.scale;
  return {
    scale: nextScale,
    x: point.x - worldX * nextScale,
    y: point.y - worldY * nextScale,
  };
}

export function centerNodeOrBoundsInViewport(
  node: MindNode | undefined,
  visibleNodes: MindNode[],
  rect: ViewportRect,
  scale: number,
): ViewportTransform {
  const nextScale = clampZoom(scale);
  const bounds = calculateViewportBounds(visibleNodes);
  const centerX = node ? node.x + node.width / 2 : bounds.minX + bounds.width / 2;
  const centerY = node ? node.y + node.height / 2 : bounds.minY + bounds.height / 2;
  return {
    scale: nextScale,
    x: rect.width / 2 - centerX * nextScale,
    y: rect.height / 2 - centerY * nextScale,
  };
}

export function fitNodesInViewport(
  nodes: MindNode[],
  rect: ViewportRect,
  options: { maxScale?: number; padding?: number } = {},
) {
  const bounds = calculateViewportBounds(nodes, options.padding ?? 80);
  const maxScale = options.maxScale ?? 1;
  const idealScale = Math.min(maxScale, rect.width / bounds.width, rect.height / bounds.height);
  const scale = clampZoom(idealScale);
  return {
    idealScale,
    transform: {
      scale,
      x: rect.width / 2 - (bounds.minX + bounds.width / 2) * scale,
      y: rect.height / 2 - (bounds.minY + bounds.height / 2) * scale,
    },
  };
}

export function calculateViewportBounds(nodes: MindNode[], padding = 80) {
  if (!nodes.length) return { minX: 0, minY: 0, width: 1, height: 1 };
  const minX = Math.min(...nodes.map((node) => node.x)) - padding;
  const minY = Math.min(...nodes.map((node) => node.y)) - padding;
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding;
  return {
    minX,
    minY,
    width: Math.max(1, Math.ceil(maxX - minX)),
    height: Math.max(1, Math.ceil(maxY - minY)),
  };
}

export function calculateExportBounds(nodes: MindNode[]) {
  const bounds = calculateViewportBounds(nodes, 120);
  return {
    ...bounds,
    width: Math.max(800, bounds.width),
    height: Math.max(600, bounds.height),
  };
}

export function viewportTransformCss(transform: ViewportTransform) {
  return `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
}
