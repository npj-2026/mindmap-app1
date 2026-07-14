"use client";

import { MindMapApp } from "@/components/MindMapApp";
import { NODE_HEIGHT, NODE_WIDTH, ROOT_NODE_ID, newNode } from "@/lib/mindmap";
import type { MindMapSnapshot } from "@/types/mindmap";

const testSnapshot: MindMapSnapshot = {
  title: "ズームテスト",
  nodes: [
    newNode({
      id: ROOT_NODE_ID,
      parentId: null,
      text: "中心テーマ",
      x: 4100,
      y: 4200,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      color: "#2563eb",
      branchColor: "#38bdf8",
    }),
    newNode({
      id: "test-topic",
      parentId: ROOT_NODE_ID,
      text: "大項目",
      x: 4540,
      y: 4060,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      color: "#0ea5e9",
      branchColor: "#0ea5e9",
    }),
    newNode({
      id: "test-topic-2",
      parentId: ROOT_NODE_ID,
      text: "大項目 2",
      x: 4540,
      y: 4340,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      color: "#10b981",
      branchColor: "#10b981",
    }),
    newNode({
      id: "test-child",
      parentId: "test-topic-2",
      text: "中項目",
      x: 4980,
      y: 4480,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      color: "#14b8a6",
      branchColor: "#14b8a6",
    }),
  ],
};

export function ViewportTestClient() {
  return (
    <MindMapApp
      roomId="viewport-test-room"
      token="viewport-test-token"
      initialMode="edit"
      testSnapshot={testSnapshot}
    />
  );
}
