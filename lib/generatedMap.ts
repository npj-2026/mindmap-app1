import { nodePalette } from "@/lib/colors";
import {
  autoLayout,
  newNode,
  rightChildX,
  ROOT_NODE_ID,
} from "@/lib/mindmap";
import { defaultNodeStyle, normalizeStyle } from "@/lib/stylePresets";
import type { GeneratedMindMap, GeneratedMindMapNode, MindMapSnapshot, MindNode } from "@/types/mindmap";

type BuildOptions = {
  parentId: string;
  parentX: number;
  parentY: number;
  parentWidth?: number;
  sourceName: string;
  startIndex?: number;
};

export function generatedMapToSnapshot(map: GeneratedMindMap): MindMapSnapshot {
  const root = newNode({
    id: ROOT_NODE_ID,
    parentId: null,
    text: map.title || "資料から作成",
    summary: map.summary,
    source: {
      documentName: map.sourceName,
      excerpt: map.summary,
      location: "全体",
      summary: map.summary,
    },
    importance: "high",
    x: 4100,
    y: 4200,
    color: "#2563eb",
    branchColor: "#38bdf8",
    style: {
      ...normalizeStyle(defaultNodeStyle),
      backgroundMode: "gradient",
      gradientFrom: "#dbeafe",
      gradientTo: "#dcfce7",
      fontSize: 18,
    },
  });
  const children = generatedNodesToMindNodes(map.children, {
    parentId: root.id,
    parentX: root.x,
    parentY: root.y,
    parentWidth: root.width,
    sourceName: map.sourceName,
  });
  return autoLayout({ title: map.title || "資料から作成", nodes: [root, ...children] });
}

export function generatedNodesToMindNodes(items: GeneratedMindMapNode[], options: BuildOptions) {
  const nodes: MindNode[] = [];
  const sourceName = options.sourceName || "資料";

  function visit(
    children: GeneratedMindMapNode[],
    parentId: string,
    depth: number,
    anchorX: number,
    anchorY: number,
    anchorWidth: number,
  ) {
    children.forEach((item, index) => {
      const id = crypto.randomUUID();
      const color = nodePalette[depth % nodePalette.length];
      const node = newNode({
        id,
        parentId,
        text: item.title,
        summary: item.summary,
        source: {
          documentName: sourceName,
          excerpt: item.sourceExcerpt || item.summary,
          location: item.sourceLocation || `階層${depth}`,
          summary: item.summary,
        },
        importance: item.importance ?? "medium",
        x: rightChildX({ x: anchorX, width: anchorWidth }),
        y: anchorY + (index + (options.startIndex ?? 0)) * 130,
        collapsed: depth >= 2 && item.children.length > 0,
        color,
        branchColor: nodePalette[(depth + 1) % nodePalette.length],
        style: {
          ...normalizeStyle(defaultNodeStyle, color),
          borderColor: color,
          backgroundColor: depth === 1 ? "#eff6ff" : depth === 2 ? "#ecfeff" : "#f8fafc",
          emphasis: item.importance === "high",
        },
      });
      nodes.push(node);
      if (item.children?.length) {
        visit(item.children, id, depth + 1, node.x, node.y, node.width);
      }
    });
  }

  visit(
    items,
    options.parentId,
    1,
    options.parentX,
    options.parentY - items.length * 70,
    options.parentWidth ?? defaultNodeStyle.minWidth,
  );
  return nodes;
}
