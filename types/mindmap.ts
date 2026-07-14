export type AccessMode = "edit" | "view";

export type ConnectionStatus =
  | "initial"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type TextAlign = "left" | "center" | "right";
export type WritingMode = "horizontal" | "vertical";
export type TextTransformMode = "none" | "uppercase" | "lowercase";
export type NodeShape =
  | "rectangle"
  | "rounded"
  | "capsule"
  | "circle"
  | "ellipse"
  | "diamond"
  | "hexagon"
  | "speech"
  | "sticky"
  | "underline"
  | "none"
  | "custom";
export type BorderStyle = "solid" | "dashed" | "dotted" | "double" | "heavy" | "none";
export type BorderPosition = "inside" | "center" | "outside";
export type BackgroundMode = "solid" | "gradient" | "none";
export type GradientDirection = "vertical" | "horizontal" | "diagonal" | "radial";

export type NodeStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  textColor: string;
  textOpacity: number;
  textAlign: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  writingMode: WritingMode;
  textTransform: TextTransformMode;
  shape: NodeShape;
  borderStyle: BorderStyle;
  borderColor: string;
  borderWidth: number;
  borderOpacity: number;
  borderRadius: number;
  borderTopWidth: number;
  borderRightWidth: number;
  borderBottomWidth: number;
  borderLeftWidth: number;
  borderPosition: BorderPosition;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundOpacity: number;
  gradientFrom: string;
  gradientTo: string;
  gradientDirection: GradientDirection;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  autoSize: boolean;
  minWidth: number;
  minHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  siblingSpacing: number;
  emphasis: boolean;
};

export type MindNode = {
  id: string;
  parentId: string | null;
  text: string;
  summary?: string;
  source?: NodeSourceReference;
  importance?: "high" | "medium" | "low";
  x: number;
  y: number;
  color: string;
  branchColor: string;
  collapsed: boolean;
  width: number;
  height: number;
  style: NodeStyle;
  createdAt: number;
  updatedAt: number;
};

export type NodeSourceReference = {
  documentName: string;
  excerpt: string;
  location: string;
  summary: string;
};

export type MindMapSnapshot = {
  title: string;
  nodes: MindNode[];
};

export type Participant = {
  connectionId: number;
  id?: string;
  name: string;
  color: string;
  canWrite: boolean;
  status: "online";
  cursor?: { x: number; y: number } | null;
  selectedNodeId?: string | null;
  editingNodeId?: string | null;
};

export type ShareLinks = {
  roomId: string;
  editUrl?: string;
  viewUrl: string;
  editToken?: string;
  viewToken?: string;
  ownerToken?: string;
};

export type RecentMap = {
  roomId: string;
  title: string;
  editUrl?: string;
  viewUrl: string;
  ownerToken?: string;
  lastOpenedAt: number;
};

export type MapVersion = {
  id: string;
  title: string;
  snapshot: MindMapSnapshot;
  createdAt: number;
  editorName: string;
  reason: string;
  checksum: string;
};

export type GeneratedMindMapNode = {
  id?: string;
  title: string;
  summary: string;
  sourceExcerpt?: string;
  sourceLocation?: string;
  importance?: "high" | "medium" | "low";
  children: GeneratedMindMapNode[];
};

export type GeneratedMindMap = {
  title: string;
  summary: string;
  sourceName: string;
  aiUsed: boolean;
  method: string;
  children: GeneratedMindMapNode[];
};

export type DocumentGenerationMethod =
  | "brief"
  | "detailed"
  | "key-points"
  | "meeting"
  | "business-plan"
  | "problems-solutions"
  | "timeline"
  | "custom";

export type DocumentGenerationApplyMode = "new" | "append" | "under-selected" | "replace";

export type LiveblocksPresence = {
  cursor: { x: number; y: number } | null;
  selectedNodeId: string | null;
  editingNodeId: string | null;
};

declare global {
  interface Liveblocks {
    Presence: LiveblocksPresence;
    UserMeta: {
      id: string;
      info: {
        name: string;
        color: string;
      };
    };
  }
}
