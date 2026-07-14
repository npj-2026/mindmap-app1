import * as Y from "yjs";
import { defaultNodeStyle, normalizeStyle } from "@/lib/stylePresets";
import type { MindMapSnapshot, MindNode, NodeSourceReference, NodeStyle } from "@/types/mindmap";

export const ROOT_NODE_ID = "root";
export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 44;
export const RIGHT_LAYOUT_ROOT_X = 4100;
export const RIGHT_LAYOUT_ROOT_Y = 4200;
export const RIGHT_LAYOUT_HORIZONTAL_SPACING = 320;
export const RIGHT_LAYOUT_VERTICAL_SPACING = 88;
export const LOCAL_ORIGIN = "local-mindmap-change";
export const SYSTEM_ORIGIN = "system-mindmap-change";

type RightLayoutOptions = {
  rootX?: number;
  rootY?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
};

export function now() {
  return Date.now();
}

export function createNodeMap(node: MindNode) {
  const yNode = new Y.Map<unknown>();
  const text = new Y.Text();
  text.insert(0, node.text);
  yNode.set("id", node.id);
  yNode.set("parentId", node.parentId);
  yNode.set("text", text);
  if (node.summary) yNode.set("summary", node.summary);
  if (node.source) yNode.set("source", node.source);
  if (node.importance) yNode.set("importance", node.importance);
  yNode.set("x", node.x);
  yNode.set("y", node.y);
  yNode.set("color", node.color);
  yNode.set("branchColor", node.branchColor);
  yNode.set("collapsed", node.collapsed);
  yNode.set("width", node.width);
  yNode.set("height", node.height);
  yNode.set("style", createStyleMap(node.style));
  yNode.set("createdAt", node.createdAt);
  yNode.set("updatedAt", node.updatedAt);
  return yNode;
}

export function createStyleMap(style: NodeStyle) {
  const yStyle = new Y.Map<unknown>();
  const normalized = normalizeStyle(style);
  for (const [key, value] of Object.entries(normalized)) {
    yStyle.set(key, value);
  }
  return yStyle;
}

export function newNode(
  values: Partial<MindNode> & Pick<MindNode, "id" | "parentId" | "text" | "x" | "y">,
): MindNode {
  const timestamp = now();
  return {
    id: values.id,
    parentId: values.parentId,
    text: values.text,
    summary: values.summary,
    source: values.source,
    importance: values.importance,
    x: values.x,
    y: values.y,
    color: values.color ?? "#2563eb",
    branchColor: values.branchColor ?? "#38bdf8",
    collapsed: values.collapsed ?? false,
    width: values.width ?? NODE_WIDTH,
    height: values.height ?? NODE_HEIGHT,
    style: normalizeStyle(values.style, values.color),
    createdAt: values.createdAt ?? timestamp,
    updatedAt: values.updatedAt ?? timestamp,
  };
}

export function getNodesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<unknown>>("nodes");
}

export function getMetaMap(doc: Y.Doc) {
  return doc.getMap<unknown>("meta");
}

export function readNode(yNode: Y.Map<unknown>): MindNode {
  const text = yNode.get("text");
  const legacyColor = stringValue(yNode.get("color"), "#2563eb");
  const styleValue = yNode.get("style");
  const style = styleValue instanceof Y.Map ? readStyleMap(styleValue, legacyColor) : normalizeStyle(undefined, legacyColor);
  return {
    id: String(yNode.get("id")),
    parentId: typeof yNode.get("parentId") === "string" ? String(yNode.get("parentId")) : null,
    text: text instanceof Y.Text ? text.toString() : String(text ?? ""),
    summary: optionalString(yNode.get("summary")),
    source: sourceValue(yNode.get("source")),
    importance: importanceValue(yNode.get("importance")),
    x: numberValue(yNode.get("x"), 0),
    y: numberValue(yNode.get("y"), 0),
    color: legacyColor,
    branchColor: stringValue(yNode.get("branchColor"), legacyColor) || legacyColor || "#38bdf8",
    collapsed: Boolean(yNode.get("collapsed")),
    width: numberValue(yNode.get("width"), style.minWidth || NODE_WIDTH),
    height: numberValue(yNode.get("height"), style.minHeight || NODE_HEIGHT),
    style,
    createdAt: numberValue(yNode.get("createdAt"), now()),
    updatedAt: numberValue(yNode.get("updatedAt"), now()),
  };
}

export function getStyleMap(yNode: Y.Map<unknown>) {
  const existing = yNode.get("style");
  if (existing instanceof Y.Map) {
    return existing as Y.Map<unknown>;
  }
  const style = createStyleMap(defaultNodeStyle);
  yNode.set("style", style);
  return style;
}

export function readStyleMap(yStyle: Y.Map<unknown>, legacyColor?: string): NodeStyle {
  return normalizeStyle(Object.fromEntries(yStyle.entries()) as Partial<NodeStyle>, legacyColor);
}

export function snapshotFromDoc(doc: Y.Doc): MindMapSnapshot {
  const meta = getMetaMap(doc);
  const nodes = Array.from(getNodesMap(doc).values()).map(readNode);
  return {
    title: stringValue(meta.get("title"), "新しいマインドマップ"),
    nodes: nodes.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export function replaceDocument(doc: Y.Doc, snapshot: MindMapSnapshot, origin = LOCAL_ORIGIN) {
  doc.transact(() => {
    const meta = getMetaMap(doc);
    const nodes = getNodesMap(doc);
    meta.set("title", snapshot.title || "マインドマップ");
    nodes.clear();
    for (const node of normalizeSnapshot(snapshot).nodes) {
      nodes.set(node.id, createNodeMap(node));
    }
  }, origin);
}

export function ensureInitialDocument(doc: Y.Doc, title = "新しいマインドマップ") {
  const nodes = getNodesMap(doc);
  if (nodes.size > 0) return;

  doc.transact(() => {
    getMetaMap(doc).set("title", title);
    nodes.set(
      ROOT_NODE_ID,
      createNodeMap(
        newNode({
          id: ROOT_NODE_ID,
          parentId: null,
          text: "中心テーマ",
          x: RIGHT_LAYOUT_ROOT_X,
          y: RIGHT_LAYOUT_ROOT_Y,
          color: "#2563eb",
          branchColor: "#38bdf8",
        }),
      ),
    );
  }, SYSTEM_ORIGIN);
}

export function normalizeSnapshot(snapshot: MindMapSnapshot): MindMapSnapshot {
  const seen = new Set<string>();
  const nodes: MindNode[] = [];
  for (const node of snapshot.nodes) {
    if (!node.id || seen.has(node.id) || !(node.parentId === null || node.parentId)) continue;
    seen.add(node.id);
    nodes.push(newNode(node));
  }

  if (!nodes.some((node) => node.id === ROOT_NODE_ID)) {
    nodes.unshift(
      newNode({
        id: ROOT_NODE_ID,
        parentId: null,
        text: "中心テーマ",
        x: RIGHT_LAYOUT_ROOT_X,
        y: RIGHT_LAYOUT_ROOT_Y,
      }),
    );
  }

  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (node.id === ROOT_NODE_ID) {
      node.parentId = null;
    } else if (!node.parentId || !ids.has(node.parentId)) {
      node.parentId = ROOT_NODE_ID;
    }
  }

  return {
    title: snapshot.title || "マインドマップ",
    nodes,
  };
}

export function getChildren(nodes: MindNode[], parentId: string) {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.createdAt - b.createdAt);
}

export function getDepth(nodes: MindNode[], nodeId: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let depth = 0;
  let current = byId.get(nodeId);
  const guard = new Set<string>();
  while (current?.parentId && !guard.has(current.id)) {
    guard.add(current.id);
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function collectDescendantIds(nodes: MindNode[], nodeId: string) {
  const byParent = new Map<string, MindNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
  }

  const result: string[] = [];
  const stack = [...(byParent.get(nodeId) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    result.push(node.id);
    stack.push(...(byParent.get(node.id) ?? []));
  }
  return result;
}

export function visibleNodeIds(nodes: MindNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visible = new Set<string>();
  for (const node of nodes) {
    let current: MindNode | undefined = node;
    let isVisible = true;
    while (current?.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent || parent.collapsed) {
        isVisible = false;
        break;
      }
      current = parent;
    }
    if (isVisible) visible.add(node.id);
  }
  return visible;
}

export function hiddenDescendantCount(nodes: MindNode[], nodeId: string) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node?.collapsed) return 0;
  return collectDescendantIds(nodes, nodeId).length;
}

export function rightChildX(
  parent: Pick<MindNode, "x" | "width">,
  horizontalSpacing = RIGHT_LAYOUT_HORIZONTAL_SPACING,
) {
  return parent.x + parent.width + Math.max(96, horizontalSpacing * 0.42);
}

export function replaceYText(yText: Y.Text, nextValue: string) {
  const current = yText.toString();
  if (current === nextValue) return;

  let start = 0;
  while (start < current.length && start < nextValue.length && current[start] === nextValue[start]) {
    start += 1;
  }

  let endCurrent = current.length;
  let endNext = nextValue.length;
  while (
    endCurrent > start &&
    endNext > start &&
    current[endCurrent - 1] === nextValue[endNext - 1]
  ) {
    endCurrent -= 1;
    endNext -= 1;
  }

  if (endCurrent > start) {
    yText.delete(start, endCurrent - start);
  }
  if (endNext > start) {
    yText.insert(start, nextValue.slice(start, endNext));
  }
}

export function autoLayout(snapshot: MindMapSnapshot, options: RightLayoutOptions = {}): MindMapSnapshot {
  const nodes = snapshot.nodes.map((node) => ({ ...node, style: { ...node.style } }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(ROOT_NODE_ID) ?? nodes.find((node) => node.parentId === null);
  if (!root) return snapshot;

  const rootId = root.id;
  const rootX = options.rootX ?? RIGHT_LAYOUT_ROOT_X;
  const rootY = options.rootY ?? RIGHT_LAYOUT_ROOT_Y;
  const horizontalSpacing = options.horizontalSpacing ?? 88;
  const verticalSpacing = options.verticalSpacing ?? 16;
  const visibleIds = visibleNodeIds(nodes);
  root.x = rootX;
  root.y = rootY;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, MindNode[]>();
  for (const node of nodes) {
    if (!node.parentId || !visibleIds.has(node.id)) continue;
    const parent = nodeById.get(node.parentId);
    if (!parent || !visibleIds.has(parent.id)) continue;
    const group = childrenByParent.get(node.parentId) ?? [];
    group.push(node);
    childrenByParent.set(node.parentId, group);
  }
  for (const group of childrenByParent.values()) {
    group.sort((a, b) => a.y - b.y || a.createdAt - b.createdAt);
  }

  const layoutOptions = {
    horizontalGap: clampLayoutGap(horizontalSpacing, 72, 96),
    verticalGap: clampLayoutGap(verticalSpacing, 12, 20),
  };
  const subtreeHeights = new Map<string, number>();
  measureTidySubtreeHeight(root, childrenByParent, subtreeHeights, layoutOptions.verticalGap);

  layoutTidyChildren(root, childrenByParent, subtreeHeights, layoutOptions);

  return { ...snapshot, nodes };
}

export function levelLabel(depth: number) {
  if (depth === 0) return "中心テーマ";
  if (depth === 1) return "大項目";
  if (depth === 2) return "中項目";
  if (depth === 3) return "小項目";
  if (depth === 4) return "詳細項目";
  if (depth === 5) return "具体的内容";
  return "項目";
}

function nodeHeightForLayout(node: MindNode) {
  return Math.max(1, node.height || NODE_HEIGHT);
}

function measureTidySubtreeHeight(
  node: MindNode,
  childrenByParent: Map<string, MindNode[]>,
  result: Map<string, number>,
  verticalGap: number,
) {
  const children = childrenByParent.get(node.id) ?? [];
  if (!children.length) {
    const height = nodeHeightForLayout(node);
    result.set(node.id, height);
    return height;
  }

  const childrenHeight =
    children.reduce((total, child) => total + measureTidySubtreeHeight(child, childrenByParent, result, verticalGap), 0) +
    verticalGap * (children.length - 1);
  const height = Math.max(nodeHeightForLayout(node), childrenHeight);
  result.set(node.id, height);
  return height;
}

function layoutTidyChildren(
  parent: MindNode,
  childrenByParent: Map<string, MindNode[]>,
  subtreeHeights: Map<string, number>,
  options: { horizontalGap: number; verticalGap: number },
) {
  const children = childrenByParent.get(parent.id) ?? [];
  if (!children.length) return;

  const parentCenterY = parent.y + nodeHeightForLayout(parent) / 2;
  const childrenBlockHeight =
    children.reduce((total, child) => total + (subtreeHeights.get(child.id) ?? nodeHeightForLayout(child)), 0) +
    options.verticalGap * (children.length - 1);
  let cursorY = parentCenterY - childrenBlockHeight / 2;
  const childX = parent.x + parent.width + options.horizontalGap;

  for (const child of children) {
    const childSubtreeHeight = subtreeHeights.get(child.id) ?? nodeHeightForLayout(child);
    child.x = childX;
    child.y = cursorY + (childSubtreeHeight - nodeHeightForLayout(child)) / 2;
    layoutTidyChildren(child, childrenByParent, subtreeHeights, options);
    cursorY += childSubtreeHeight + options.verticalGap;
  }
}

function clampLayoutGap(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function hasLeftFacingNodes(nodes: MindNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.some((node) => {
    if (!node.parentId) return false;
    const parent = byId.get(node.parentId);
    return Boolean(parent && node.x <= parent.x);
  });
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function importanceValue(value: unknown): MindNode["importance"] {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function sourceValue(value: unknown): NodeSourceReference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<NodeSourceReference>;
  return {
    documentName: stringValue(source.documentName, "資料"),
    excerpt: stringValue(source.excerpt, ""),
    location: stringValue(source.location, ""),
    summary: stringValue(source.summary, ""),
  };
}
