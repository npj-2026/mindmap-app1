import * as Y from "yjs";
import { defaultNodeStyle, normalizeStyle } from "@/lib/stylePresets";
import type { MindMapSnapshot, MindNode, NodeSourceReference, NodeStyle } from "@/types/mindmap";

export const ROOT_NODE_ID = "root";
export const NODE_WIDTH = 188;
export const NODE_HEIGHT = 72;
export const LOCAL_ORIGIN = "local-mindmap-change";
export const SYSTEM_ORIGIN = "system-mindmap-change";

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
    branchColor: stringValue(yNode.get("branchColor"), "#38bdf8"),
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
          x: 4100,
          y: 4200,
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
        x: 4100,
        y: 4200,
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

export function autoLayout(snapshot: MindMapSnapshot): MindMapSnapshot {
  const nodes = snapshot.nodes.map((node) => ({ ...node, style: { ...node.style } }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(ROOT_NODE_ID) ?? nodes.find((node) => node.parentId === null);
  if (!root) return snapshot;

  const rootId = root.id;
  const children = getChildren(nodes, rootId);
  const left = children.filter((_, index) => index % 2 === 1);
  const right = children.filter((_, index) => index % 2 === 0);
  root.x = 4100;
  root.y = 4200;

  const subtreeSpan = new Map<string, number>();
  measureSubtreeSpan(nodes, rootId, subtreeSpan);

  layoutSide(nodes, right, root.x + 360, root.y, 1, subtreeSpan);
  layoutSide(nodes, left, root.x - 360, root.y, -1, subtreeSpan);

  return { ...snapshot, nodes };
}

function layoutSide(
  nodes: MindNode[],
  group: MindNode[],
  anchorX: number,
  anchorY: number,
  direction: 1 | -1,
  subtreeSpan: Map<string, number>,
) {
  const spacingY = 150;
  const totalSpan = group.reduce((total, node) => total + (subtreeSpan.get(node.id) ?? 1), 0);
  let cursorY = anchorY - ((Math.max(1, totalSpan) - 1) * spacingY) / 2;

  group.forEach((node) => {
    const span = subtreeSpan.get(node.id) ?? 1;
    node.x = anchorX;
    node.y = cursorY + ((span - 1) * spacingY) / 2;
    const children = getChildren(nodes, node.id);
    if (children.length) {
      layoutSide(nodes, children, anchorX + direction * 300, node.y, direction, subtreeSpan);
    }
    cursorY += span * spacingY;
  });
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

function measureSubtreeSpan(nodes: MindNode[], nodeId: string, result: Map<string, number>): number {
  const children = getChildren(nodes, nodeId);
  if (!children.length) {
    result.set(nodeId, 1);
    return 1;
  }
  const span = children.reduce((total, child) => total + measureSubtreeSpan(nodes, child.id, result), 0);
  result.set(nodeId, Math.max(1, span));
  return Math.max(1, span);
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
