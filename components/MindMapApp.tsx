"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@liveblocks/client";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import * as Y from "yjs";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileJson,
  FileText,
  GitBranchPlus,
  Group,
  Loader2,
  Lock,
  Maximize,
  Menu,
  Minus,
  MousePointer2,
  Move,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paintbrush,
  Plus,
  Redo2,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  AccessMode,
  ConnectionStatus,
  LiveblocksPresence,
  MindMapSnapshot,
  MindNode,
  NodeStyle,
  Participant,
  ShareLinks,
} from "@/types/mindmap";
import {
  LOCAL_ORIGIN,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROOT_NODE_ID,
  autoLayout,
  collectDescendantIds,
  createNodeMap,
  ensureInitialDocument,
  getChildren,
  getDepth,
  getMetaMap,
  getNodesMap,
  hiddenDescendantCount,
  levelLabel,
  newNode,
  normalizeSnapshot,
  readNode,
  replaceDocument,
  replaceYText,
  snapshotFromDoc,
  visibleNodeIds,
  getStyleMap,
} from "@/lib/mindmap";
import { getClientId, getUserName, pendingImportKey, saveCreatedLinks, saveRecentMap, setUserName } from "@/lib/local";
import { nodePalette } from "@/lib/colors";
import { StylePanel } from "@/components/StylePanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { defaultNodeStyle, normalizeStyle } from "@/lib/stylePresets";
import {
  backgroundCss,
  borderCssStyle,
  hexToRgba,
  nodeOuterStyle,
  nodeTextStyle,
  radiusForShape,
  shadowCss,
} from "@/lib/styleRuntime";

type LiveblocksOther = {
  connectionId: number;
  id?: string;
  info?: { name?: string; color?: string };
  presence?: LiveblocksPresence;
  canWrite?: boolean;
};

type LiveRoom = {
  updatePresence: (presence: Partial<LiveblocksPresence>) => void;
  subscribe: (event: string, callback: (...args: any[]) => void) => () => void;
  getOthers: () => LiveblocksOther[];
};

type MindMapAppProps = {
  roomId: string;
  token: string;
  initialMode: AccessMode;
};

type Transform = {
  x: number;
  y: number;
  scale: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  nodes: Array<{ id: string; x: number; y: number }>;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

const initialSnapshot: MindMapSnapshot = {
  title: "新しいマインドマップ",
  nodes: [],
};

export function MindMapApp({ roomId, token, initialMode }: MindMapAppProps) {
  const [userName, setUserNameState] = useState("ゲスト");
  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [snapshot, setSnapshot] = useState<MindMapSnapshot>(initialSnapshot);
  const [selectedNodeId, setSelectedNodeId] = useState(ROOT_NODE_ID);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("initial");
  const [isSynced, setIsSynced] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinks | null>(null);
  const [message, setMessage] = useState("");
  const [transform, setTransform] = useState<Transform>({ x: -3000, y: -3300, scale: 0.9 });
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([ROOT_NODE_ID]);
  const [copiedStyle, setCopiedStyle] = useState<NodeStyle | null>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isStyleOpen, setIsStyleOpen] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const docRef = useRef<Y.Doc | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const roomRef = useRef<LiveRoom | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

  const canEdit = mode === "edit";
  const nodesById = useMemo(() => new Map(snapshot.nodes.map((node) => [node.id, node])), [snapshot]);
  const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) : undefined;
  const selectedNodes = useMemo(
    () => selectedNodeIds.map((id) => nodesById.get(id)).filter((node): node is MindNode => Boolean(node)),
    [nodesById, selectedNodeIds],
  );
  const visibleIds = useMemo(() => visibleNodeIds(snapshot.nodes), [snapshot.nodes]);
  const visibleNodes = useMemo(
    () => snapshot.nodes.filter((node) => visibleIds.has(node.id)),
    [snapshot.nodes, visibleIds],
  );
  const branches = useMemo(
    () => visibleNodes.filter((node) => node.parentId && visibleIds.has(node.parentId)),
    [visibleNodes, visibleIds],
  );

  const liveblocksClient = useMemo(() => {
    const userId = getClientId();
    return createClient({
      throttle: 16,
      preventUnsavedChanges: true,
      lostConnectionTimeout: 3000,
      authEndpoint: async (room) => {
        const response = await fetch("/api/liveblocks-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, token, userId, name: userName }),
        });
        return response.json();
      },
    });
  }, [token, userName]);

  useEffect(() => {
    setUserNameState(getUserName());
    setShowGuide(window.localStorage.getItem("mindmap:guide-seen") !== "yes");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!token) {
      setMessage("共有リンクに必要なトークンがありません。ホームから新しいマップを作成してください。");
      return;
    }

    let mounted = true;
    fetch(`/api/maps/${encodeURIComponent(roomId)}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = (await response.json()) as ShareLinks & { error?: string; reason?: string };
        if (!response.ok) throw new Error(data.reason || "共有リンクを確認できませんでした。");
        if (!mounted) return;
        setShareLinks(data);
        setMode(data.editUrl ? "edit" : "view");
        saveRecentMap({
          roomId,
          title: snapshot.title || "マインドマップ",
          editUrl: data.editUrl,
          viewUrl: data.viewUrl,
          lastOpenedAt: Date.now(),
        });
      })
      .catch((caught) => {
        if (mounted) setMessage(caught instanceof Error ? caught.message : "共有リンクを確認できませんでした。");
      });

    return () => {
      mounted = false;
    };
  }, [roomId, snapshot.title, token]);

  useEffect(() => {
    if (!token) return;

    const entered = liveblocksClient.enterRoom(roomId, {
      initialPresence: {
        cursor: null,
        selectedNodeId: null,
        editingNodeId: null,
      },
    });
    const room = entered.room as unknown as LiveRoom;
    roomRef.current = room;
    const yProvider = getYjsProviderForRoom(entered.room as never, {
      offlineSupport_experimental: true,
    });
    const yDoc = yProvider.getYDoc();
    docRef.current = yDoc;

    const nodesMap = getNodesMap(yDoc);
    const metaMap = getMetaMap(yDoc);
    undoManagerRef.current = new Y.UndoManager([nodesMap, metaMap], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 450,
    });

    const updateSnapshot = () => {
      const next = snapshotFromDoc(yDoc);
      setSnapshot(next);
      saveRecentMap({
        roomId,
        title: next.title,
        editUrl: shareLinks?.editUrl,
        viewUrl: shareLinks?.viewUrl ?? window.location.href,
        lastOpenedAt: Date.now(),
      });
    };

    const handleSync = (synced: boolean) => {
      setIsSynced(synced);
      if (!synced) return;

      const pending = window.localStorage.getItem(pendingImportKey(roomId));
      if (pending && getNodesMap(yDoc).size === 0) {
        try {
          replaceDocument(yDoc, JSON.parse(pending) as MindMapSnapshot, LOCAL_ORIGIN);
          window.localStorage.removeItem(pendingImportKey(roomId));
        } catch {
          window.localStorage.removeItem(pendingImportKey(roomId));
        }
      } else {
        ensureInitialDocument(yDoc);
      }
      updateSnapshot();
    };

    yProvider.on("sync", handleSync);
    if (yProvider.synced) handleSync(true);
    nodesMap.observeDeep(updateSnapshot);
    metaMap.observe(updateSnapshot);

    const updateParticipants = (others: LiveblocksOther[]) => {
      setParticipants([
        {
          connectionId: 0,
          id: getClientId(),
          name: userName,
          color: "#2563eb",
          canWrite: canEdit,
          status: "online",
          cursor: null,
          selectedNodeId,
          editingNodeId,
        },
        ...others.map((other) => ({
          connectionId: other.connectionId,
          id: other.id,
          name: other.info?.name || "ゲスト",
          color: other.info?.color || "#0891b2",
          canWrite: Boolean(other.canWrite),
          status: "online" as const,
          cursor: other.presence?.cursor ?? null,
          selectedNodeId: other.presence?.selectedNodeId ?? null,
          editingNodeId: other.presence?.editingNodeId ?? null,
        })),
      ]);
    };

    updateParticipants(room.getOthers());
    const unsubscribeOthers = room.subscribe("others", (others: LiveblocksOther[]) => {
      updateParticipants(others);
    });
    const unsubscribeStatus = room.subscribe("status", (status: ConnectionStatus) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubscribeOthers();
      unsubscribeStatus();
      nodesMap.unobserveDeep(updateSnapshot);
      metaMap.unobserve(updateSnapshot);
      yProvider.off("sync", handleSync);
      undoManagerRef.current?.destroy();
      roomRef.current = null;
      entered.leave();
    };
  }, [canEdit, editingNodeId, liveblocksClient, roomId, selectedNodeId, shareLinks?.editUrl, shareLinks?.viewUrl, token, userName]);

  useEffect(() => {
    roomRef.current?.updatePresence({ selectedNodeId, editingNodeId });
  }, [selectedNodeId, editingNodeId]);

  const selectNode = useCallback((nodeId: string, additive = false) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds((current) => {
      if (!additive) return [nodeId];
      return current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
    });
  }, []);

  useEffect(() => {
    if (!snapshot.nodes.length) return;
    const ids = new Set(snapshot.nodes.map((node) => node.id));
    if (!ids.has(selectedNodeId)) {
      selectNode(ids.has(ROOT_NODE_ID) ? ROOT_NODE_ID : snapshot.nodes[0].id);
      return;
    }
    setSelectedNodeIds((current) => current.filter((id) => ids.has(id)));
  }, [selectNode, selectedNodeId, snapshot.nodes]);

  const transact = useCallback((fn: (doc: Y.Doc) => void) => {
    const doc = docRef.current;
    if (!doc || !canEdit) return;
    doc.transact(() => fn(doc), LOCAL_ORIGIN);
  }, [canEdit]);

  const updateNodeField = useCallback(
    (nodeId: string, field: keyof MindNode, value: string | number | boolean | null) => {
      transact((doc) => {
        const yNode = getNodesMap(doc).get(nodeId);
        if (!yNode) return;
        yNode.set(field, value);
        yNode.set("updatedAt", Date.now());
      });
    },
    [transact],
  );

  const updateTitle = useCallback(
    (title: string) => {
      transact((doc) => {
        getMetaMap(doc).set("title", title);
      });
    },
    [transact],
  );

  const updateText = useCallback(
    (nodeId: string, value: string) => {
      transact((doc) => {
        const yNode = getNodesMap(doc).get(nodeId);
        const text = yNode?.get("text");
        if (text instanceof Y.Text) {
          replaceYText(text, value);
          yNode?.set("updatedAt", Date.now());
        }
      });
    },
    [transact],
  );

  const patchSelectedStyles = useCallback(
    (patch: Partial<NodeStyle>) => {
      if (!canEdit || !selectedNodes.length) return;
      transact((doc) => {
        const nodes = getNodesMap(doc);
        for (const node of selectedNodes) {
          const yNode = nodes.get(node.id);
          if (!yNode) continue;
          const styleMap = getStyleMap(yNode);
          for (const [key, value] of Object.entries(patch)) {
            styleMap.set(key, value);
          }
          yNode.set("updatedAt", Date.now());
        }
      });
    },
    [canEdit, selectedNodes, transact],
  );

  const patchSelectedNodeFields = useCallback(
    (patch: Partial<Pick<MindNode, "width" | "height">>) => {
      if (!canEdit || !selectedNodes.length) return;
      transact((doc) => {
        const nodes = getNodesMap(doc);
        for (const node of selectedNodes) {
          const yNode = nodes.get(node.id);
          if (!yNode) continue;
          for (const [key, value] of Object.entries(patch)) {
            yNode.set(key, value);
          }
          yNode.set("updatedAt", Date.now());
        }
      });
    },
    [canEdit, selectedNodes, transact],
  );

  const copyStyle = useCallback(() => {
    if (!selectedNode) return;
    setCopiedStyle(normalizeStyle(selectedNode.style, selectedNode.color));
    setToast("スタイルをコピーしました");
  }, [selectedNode]);

  const pasteStyle = useCallback(() => {
    if (!copiedStyle) return;
    patchSelectedStyles(copiedStyle);
    setToast("スタイルを貼り付けました");
  }, [copiedStyle, patchSelectedStyles]);

  const applyStyleScope = useCallback(
    (scope: "level" | "children" | "all") => {
      if (!selectedNode || !canEdit) return;
      const sourceStyle = normalizeStyle(selectedNode.style, selectedNode.color);
      let targetIds: string[] = [];
      if (scope === "all") {
        targetIds = snapshot.nodes.map((node) => node.id);
      } else if (scope === "children") {
        targetIds = collectDescendantIds(snapshot.nodes, selectedNode.id);
      } else {
        const depth = getDepth(snapshot.nodes, selectedNode.id);
        targetIds = snapshot.nodes.filter((node) => getDepth(snapshot.nodes, node.id) === depth).map((node) => node.id);
      }
      transact((doc) => {
        const nodes = getNodesMap(doc);
        for (const id of targetIds) {
          const yNode = nodes.get(id);
          if (!yNode) continue;
          const styleMap = getStyleMap(yNode);
          for (const [key, value] of Object.entries(sourceStyle)) {
            styleMap.set(key, value);
          }
          yNode.set("updatedAt", Date.now());
        }
      });
      setToast("スタイルを一括適用しました");
    },
    [canEdit, selectedNode, snapshot.nodes, transact],
  );

  const addChild = useCallback((parentOverride?: MindNode) => {
    const parentNode = parentOverride ?? selectedNode;
    if (!parentNode || !canEdit) return;
    const depth = getDepth(snapshot.nodes, parentNode.id) + 1;
    const siblings = getChildren(snapshot.nodes, parentNode.id);
    const root = nodesById.get(ROOT_NODE_ID);
    const direction = parentNode.id === ROOT_NODE_ID ? (siblings.length % 2 === 0 ? 1 : -1) : root && parentNode.x < root.x ? -1 : 1;
    const id = crypto.randomUUID();
    const savedStyle = readSavedDefaultStyle();
    const child = newNode({
      id,
      parentId: parentNode.id,
      text: `${levelLabel(depth)} ${siblings.length + 1}`,
      x: parentNode.x + direction * 280,
      y: parentNode.y + (siblings.length - (siblings.length > 0 ? (siblings.length - 1) / 2 : 0)) * parentNode.style.siblingSpacing,
      color: nodePalette[depth % nodePalette.length],
      branchColor: nodePalette[(depth + 1) % nodePalette.length],
      style: savedStyle ?? {
        ...parentNode.style,
        borderColor: nodePalette[depth % nodePalette.length],
      },
    });
    transact((doc) => {
      getNodesMap(doc).set(id, createNodeMap(child));
      const parent = getNodesMap(doc).get(parentNode.id);
      parent?.set("collapsed", false);
    });
    selectNode(id);
    setToast("子ノードを追加しました");
  }, [canEdit, nodesById, selectNode, selectedNode, snapshot.nodes, transact]);

  const addSibling = useCallback(() => {
    if (!selectedNode || selectedNode.id === ROOT_NODE_ID || !canEdit) {
      addChild();
      return;
    }
    const parent = selectedNode.parentId ? nodesById.get(selectedNode.parentId) : undefined;
    if (!parent) return;
    const siblings = getChildren(snapshot.nodes, parent.id);
    const id = crypto.randomUUID();
    const sibling = newNode({
      id,
      parentId: parent.id,
      text: `${levelLabel(getDepth(snapshot.nodes, selectedNode.id))} ${siblings.length + 1}`,
      x: selectedNode.x,
      y: selectedNode.y + selectedNode.style.siblingSpacing,
      color: selectedNode.color,
      branchColor: selectedNode.branchColor,
      style: selectedNode.style,
    });
    transact((doc) => {
      getNodesMap(doc).set(id, createNodeMap(sibling));
    });
    selectNode(id);
    setToast("同じ階層に追加しました");
  }, [addChild, canEdit, nodesById, selectNode, selectedNode, snapshot.nodes, transact]);

  const duplicateNode = useCallback(() => {
    if (!selectedNode || selectedNode.id === ROOT_NODE_ID || !canEdit) return;
    const subtreeIds = [selectedNode.id, ...collectDescendantIds(snapshot.nodes, selectedNode.id)];
    const idMap = new Map(subtreeIds.map((id) => [id, crypto.randomUUID()]));
    const clones = subtreeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is MindNode => Boolean(node))
      .map((node) =>
        newNode({
          ...node,
          id: idMap.get(node.id) ?? crypto.randomUUID(),
          parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) ?? null : node.parentId,
          text: node.id === selectedNode.id ? `${node.text} コピー` : node.text,
          x: node.x + 46,
          y: node.y + 46,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );

    transact((doc) => {
      const nodes = getNodesMap(doc);
      for (const node of clones) {
        nodes.set(node.id, createNodeMap(node));
      }
    });
    selectNode(clones[0]?.id ?? selectedNode.id);
    setToast("ノードを複製しました");
  }, [canEdit, nodesById, selectNode, selectedNode, snapshot.nodes, transact]);

  const deleteNode = useCallback(() => {
    if (!selectedNode || selectedNode.id === ROOT_NODE_ID || !canEdit) return;
    if (!window.confirm("選択中のノードと配下のノードを削除します。よろしいですか？")) return;
    const targetIds = [selectedNode.id, ...collectDescendantIds(snapshot.nodes, selectedNode.id)];
    const nextSelection = selectedNode.parentId ?? ROOT_NODE_ID;
    transact((doc) => {
      const nodes = getNodesMap(doc);
      for (const id of targetIds) nodes.delete(id);
    });
    selectNode(nextSelection);
    setToast("ノードを削除しました");
  }, [canEdit, selectNode, selectedNode, snapshot.nodes, transact]);

  const runAutoLayout = useCallback(() => {
    if (!canEdit) return;
    const next = autoLayout(snapshot);
    transact((doc) => replaceDocument(doc, next, LOCAL_ORIGIN));
    setToast("自動整列しました");
  }, [canEdit, snapshot, transact]);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("textarea,input,select") ?? false;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (!isTyping && event.key === "Tab") {
        event.preventDefault();
        addChild();
      } else if (!isTyping && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteNode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addChild, deleteNode, redo, undo]);

  const zoomBy = useCallback((amount: number) => {
    setTransform((current) => ({
      ...current,
      scale: Math.min(2.2, Math.max(0.35, current.scale + amount)),
    }));
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: -3000, y: -3300, scale: 0.9 });
  }, []);

  const canvasToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - transform.x) / transform.scale,
        y: (clientY - rect.top - transform.y) / transform.scale,
      };
    },
    [transform],
  );

  const startNodeDrag = useCallback(
    (event: React.PointerEvent, node: MindNode) => {
      if (!canEdit) return;
      const target = event.target as HTMLElement;
      if (target.closest("textarea,button,input")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedNodeId(node.id);
      const subtreeIds = [node.id, ...collectDescendantIds(snapshot.nodes, node.id)];
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        nodes: subtreeIds
          .map((id) => nodesById.get(id))
          .filter((item): item is MindNode => Boolean(item))
          .map((item) => ({ id: item.id, x: item.x, y: item.y })),
      };
    },
    [canEdit, nodesById, snapshot.nodes],
  );

  const moveNodeDrag = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !canEdit) return;
      const dx = (event.clientX - drag.startX) / transform.scale;
      const dy = (event.clientY - drag.startY) / transform.scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      transact((doc) => {
        const nodes = getNodesMap(doc);
        for (const item of drag.nodes) {
          const yNode = nodes.get(item.id);
          yNode?.set("x", Math.round(item.x + dx));
          yNode?.set("y", Math.round(item.y + dy));
          yNode?.set("updatedAt", Date.now());
        }
      });
    },
    [canEdit, transact, transform.scale],
  );

  const endNodeDrag = useCallback((event: React.PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const startPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".mind-node")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: transform.x,
      startY: transform.y,
    };
  }, [transform.x, transform.y]);

  const movePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setTransform((current) => ({
      ...current,
      x: pan.startX + event.clientX - pan.startClientX,
      y: pan.startY + event.clientY - pan.startClientY,
    }));
  }, []);

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }
  }, []);

  const updateCursor = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const point = canvasToWorld(event.clientX, event.clientY);
      roomRef.current?.updatePresence({ cursor: point });
    },
    [canvasToWorld],
  );

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    setTransform((current) => ({
      ...current,
      scale: Math.min(2.2, Math.max(0.35, current.scale + (event.deltaY > 0 ? -0.08 : 0.08))),
    }));
  }, []);

  const loadShareLinks = useCallback(async () => {
    const response = await fetch(`/api/maps/${encodeURIComponent(roomId)}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await response.json()) as ShareLinks & { reason?: string };
    if (!response.ok) throw new Error(data.reason || "共有リンクを作成できませんでした。");
    setShareLinks(data);
    setIsShareOpen(true);
    setToast("共有リンクを表示しました");
  }, [roomId, token]);

  const createNewMap = useCallback(async () => {
    const response = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新しいマインドマップ" }),
    });
    const data = (await response.json()) as ShareLinks & { title: string; message?: string };
    if (!response.ok || !data.editUrl) throw new Error(data.message || "新規マップを作成できませんでした。");
    saveCreatedLinks(data);
    window.location.href = data.editUrl;
  }, []);

  const duplicateMap = useCallback(async () => {
    const response = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${snapshot.title} コピー` }),
    });
    const data = (await response.json()) as ShareLinks & { title: string; message?: string };
    if (!response.ok || !data.editUrl) throw new Error(data.message || "複製を作成できませんでした。");
    window.localStorage.setItem(
      pendingImportKey(data.roomId),
      JSON.stringify({ ...snapshot, title: `${snapshot.title} コピー` }),
    );
    saveCreatedLinks(data);
    window.location.href = data.editUrl;
  }, [snapshot]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${safeFileName(snapshot.title)}.json`);
    setToast("JSONを書き出しました");
  }, [snapshot]);

  const importJson = useCallback(async (file: File) => {
    if (!canEdit) return;
    const text = await file.text();
    const parsed = normalizeSnapshot(JSON.parse(text) as MindMapSnapshot);
    transact((doc) => replaceDocument(doc, parsed, LOCAL_ORIGIN));
    setToast("JSONを読み込みました");
  }, [canEdit, transact]);

  const exportPng = useCallback(async () => {
    const { dataUrl } = await renderSnapshotToPng(snapshot);
    downloadDataUrl(dataUrl, `${safeFileName(snapshot.title)}.png`);
    setToast("PNGを書き出しました");
  }, [snapshot]);

  const exportPdf = useCallback(async () => {
    const { dataUrl, width, height } = await renderSnapshotToPng(snapshot);
    const { jsPDF } = await import("jspdf");
    const orientation = width >= height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const scale = Math.min((pageWidth - 48) / width, (pageHeight - 48) / height);
    const imageWidth = width * scale;
    const imageHeight = height * scale;
    pdf.addImage(dataUrl, "PNG", (pageWidth - imageWidth) / 2, (pageHeight - imageHeight) / 2, imageWidth, imageHeight);
    pdf.save(`${safeFileName(snapshot.title)}.pdf`);
    setToast("PDFを書き出しました");
  }, [snapshot]);

  const selectedDepth = selectedNode ? getDepth(snapshot.nodes, selectedNode.id) : 0;
  const statusText = statusLabel(connectionStatus, isSynced);

  return (
    <main className={`mindmap-shell ${isLeftOpen ? "" : "left-collapsed"} ${isStyleOpen ? "" : "style-collapsed"}`}>
      <aside className="left-rail">
        <a className="rail-back" href="/">
          <ArrowLeft size={18} />
          ホーム
        </a>
        <button className="rail-collapse" type="button" onClick={() => setIsLeftOpen(false)}>
          <PanelLeftClose size={16} />
          パネルを閉じる
        </button>
        <div className="rail-section">
          <div className="rail-title">ファイル</div>
          <button type="button" onClick={createNewMap}>
            <Plus size={16} />
            新規作成
          </button>
          <button type="button" onClick={duplicateMap} disabled={!isSynced}>
            <Copy size={16} />
            複製
          </button>
          <button type="button" onClick={exportJson}>
            <FileJson size={16} />
            JSON保存
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canEdit}>
            <Upload size={16} />
            JSON読込
          </button>
        </div>
        <div className="rail-section">
          <div className="rail-title">書き出し</div>
          <button type="button" onClick={exportPng}>
            <Download size={16} />
            PNG
          </button>
          <button type="button" onClick={exportPdf}>
            <FileText size={16} />
            PDF
          </button>
        </div>
        <div className="rail-section">
          <div className="rail-title">テンプレート</div>
          <button type="button" onClick={() => loadSampleMap(transact)}>
            <Sparkles size={16} />
            サンプルマップ
          </button>
          <button type="button" onClick={() => loadBlankMap(transact)}>
            <FileText size={16} />
            空白から始める
          </button>
        </div>
        <div className="rail-section">
          <div className="rail-title">参加者</div>
          <div className="participant-list">
            {participants.map((participant) => (
              <div className="participant" key={`${participant.connectionId}-${participant.id ?? participant.name}`}>
                <span className="avatar-dot" style={{ background: participant.color }} />
                <div>
                  <strong>{participant.name}</strong>
                  <span>{participant.canWrite ? "編集可" : "閲覧中"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="appbar">
          {!isLeftOpen ? (
            <button className="panel-toggle" type="button" onClick={() => setIsLeftOpen(true)} aria-label="左パネルを開く">
              <PanelLeftOpen size={18} />
            </button>
          ) : null}
          <div className="title-stack">
            <input
              className="map-title"
              value={snapshot.title}
              onChange={(event) => updateTitle(event.target.value)}
              disabled={!canEdit}
              aria-label="マップ名"
            />
            <div className="connection-line">
              {connectionStatus === "connected" && isSynced ? (
                <span className="status-dot online" />
              ) : (
                <span className="status-dot syncing" />
              )}
              {statusText}
              {mode === "view" ? (
                <span className="readonly-pill">
                  <Eye size={14} />
                  閲覧専用
                </span>
              ) : null}
            </div>
          </div>

          <label className="name-field">
            表示名
            <input
              value={userName}
              onChange={(event) => {
                setUserNameState(event.target.value);
                setUserName(event.target.value);
              }}
            />
          </label>

          <div className="header-participants">
            <Group size={17} />
            <span>{Math.max(1, participants.length)}人</span>
          </div>

          <ThemeToggle />

          <button className="share-button" type="button" onClick={loadShareLinks}>
            <Share2 size={17} />
            共有
          </button>
        </header>

        <nav className="toolbar" aria-label="編集ツール">
          <div className="tool-group">
            <button type="button" onClick={undo} disabled={!canEdit}>
              <Undo2 size={17} />
              元に戻す
            </button>
            <button type="button" onClick={redo} disabled={!canEdit}>
              <Redo2 size={17} />
              やり直す
            </button>
          </div>
          <div className="tool-group">
            <button type="button" onClick={addSibling} disabled={!canEdit || !selectedNode}>
              <Plus size={17} />
              ノード追加
            </button>
            <button type="button" onClick={() => addChild()} disabled={!canEdit || !selectedNode}>
              <GitBranchPlus size={17} />
              子ノード
            </button>
            <button type="button" onClick={duplicateNode} disabled={!canEdit || !selectedNode || selectedNode.id === ROOT_NODE_ID}>
              <Copy size={17} />
              ノード複製
            </button>
            <button type="button" className="danger" onClick={deleteNode} disabled={!canEdit || !selectedNode || selectedNode.id === ROOT_NODE_ID}>
              <Trash2 size={17} />
              削除
            </button>
          </div>
          <div className="tool-group">
            <button
              type="button"
              onClick={() => selectedNode && updateNodeField(selectedNode.id, "collapsed", !selectedNode.collapsed)}
              disabled={!canEdit || !selectedNode || !getChildren(snapshot.nodes, selectedNode.id).length}
            >
              {selectedNode?.collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
              折りたたみ
            </button>
            <button type="button" onClick={() => setIsStyleOpen(true)} disabled={!selectedNode}>
              <Palette size={17} />
              スタイル
            </button>
            <button type="button" onClick={runAutoLayout} disabled={!canEdit}>
              <Sparkles size={17} />
              自動整列
            </button>
          </div>
          <div className="tool-group export-menu">
            <button type="button" onClick={() => setIsMoreOpen((current) => !current)}>
              <Menu size={17} />
              その他
            </button>
            {isMoreOpen ? (
              <div className="more-popover">
                <button type="button" onClick={exportJson}>
                  <FileJson size={16} />
                  JSON保存
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canEdit}>
                  <Upload size={16} />
                  JSON読込
                </button>
                <button type="button" onClick={exportPng}>
                  <Download size={16} />
                  PNG書き出し
                </button>
                <button type="button" onClick={exportPdf}>
                  <FileText size={16} />
                  PDF書き出し
                </button>
              </div>
            ) : null}
          </div>
        </nav>

        {message ? <div className="notice">{message}</div> : null}

        <div
          ref={canvasRef}
          className="canvas"
          onWheel={handleWheel}
          onPointerDown={startPan}
          onPointerMove={(event) => {
            movePan(event);
            updateCursor(event);
          }}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          {!isSynced ? (
            <div className="loading-overlay">
              <Loader2 className="spin" size={28} />
              同期しています
            </div>
          ) : null}

          {showGuide ? (
            <div className="guide-card">
              <strong>はじめ方</strong>
              <span>中心テーマをダブルクリックして編集</span>
              <span>＋ボタンで子ノードを追加</span>
              <span>ドラッグして移動</span>
              <span>共有ボタンから共同編集</span>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    loadSampleMap(transact);
                    setShowGuide(false);
                    setToast("サンプルマップを読み込みました");
                  }}
                >
                  サンプルマップから始める
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.localStorage.setItem("mindmap:guide-seen", "yes");
                    setShowGuide(false);
                  }}
                >
                  空白で続ける
                </button>
              </div>
            </div>
          ) : null}

          <div
            ref={worldRef}
            className="world"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          >
            <svg className="branches" width="9000" height="9000" viewBox="0 0 9000 9000">
              {branches.map((node) => {
                const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
                if (!parent) return null;
                return <path key={node.id} d={branchPath(parent, node)} stroke={node.branchColor} />;
              })}
            </svg>

            {visibleNodes.map((node) => {
              const childCount = getChildren(snapshot.nodes, node.id).length;
              const hiddenCount = hiddenDescendantCount(snapshot.nodes, node.id);
              const remoteEditors = participants.filter((participant) => participant.editingNodeId === node.id && participant.connectionId !== 0);
              const remoteSelectors = participants.filter((participant) => participant.selectedNodeId === node.id && participant.connectionId !== 0);
              const nodeStyle = normalizeStyle(node.style, node.color);
              const selected = selectedNodeIds.includes(node.id);

              return (
                <div
                  className={`mind-node shape-${nodeStyle.shape} ${selected ? "selected" : ""} ${nodeStyle.emphasis ? "emphasis" : ""} ${
                    remoteEditors.length ? "remote-editing" : remoteSelectors.length ? "remote-selected" : ""
                  }`}
                  key={node.id}
                  style={
                    {
                      ...nodeOuterStyle(node),
                      "--remote-color": remoteEditors[0]?.color ?? remoteSelectors[0]?.color ?? node.color,
                    } as CSSProperties
                  }
                  onPointerDown={(event) => startNodeDrag(event, node)}
                  onPointerMove={moveNodeDrag}
                  onPointerUp={endNodeDrag}
                  onPointerCancel={endNodeDrag}
                  onClick={(event) => selectNode(node.id, event.shiftKey)}
                  onDoubleClick={() => {
                    setEditingNodeId(node.id);
                    window.setTimeout(() => document.getElementById(`node-text-${node.id}`)?.focus(), 0);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    selectNode(node.id);
                    setIsStyleOpen(true);
                    setToast("右側でノードを編集できます");
                  }}
                >
                  <div className="node-toolbar">
                    <span className="node-level">{levelLabel(getDepth(snapshot.nodes, node.id))}</span>
                    <button
                      type="button"
                      className="quick-add"
                      disabled={!canEdit}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectNode(node.id);
                        addChild(node);
                      }}
                      aria-label="子ノードを追加"
                    >
                      <Plus size={15} />
                    </button>
                    {childCount ? (
                      <button
                        type="button"
                        className="collapse-button"
                        disabled={!canEdit}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateNodeField(node.id, "collapsed", !node.collapsed);
                        }}
                        aria-label={node.collapsed ? "展開" : "折りたたみ"}
                      >
                        {node.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        {node.collapsed && hiddenCount ? <b>{hiddenCount}</b> : null}
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    id={`node-text-${node.id}`}
                    value={node.text}
                    disabled={!canEdit}
                    rows={Math.max(2, Math.min(8, node.text.split("\n").length + 1))}
                    style={nodeTextStyle(nodeStyle)}
                    onFocus={() => {
                      selectNode(node.id);
                      setEditingNodeId(node.id);
                    }}
                    onBlur={() => setEditingNodeId((current) => (current === node.id ? null : current))}
                    onChange={(event) => updateText(node.id, event.target.value)}
                    aria-label={`${levelLabel(getDepth(snapshot.nodes, node.id))}の文字`}
                  />
                  {remoteSelectors.length || remoteEditors.length ? (
                    <div className="remote-badges">
                      {[...remoteSelectors, ...remoteEditors].slice(0, 3).map((participant) => (
                        <span
                          key={`${participant.connectionId}-${participant.name}`}
                          style={{ background: participant.color }}
                          title={`${participant.name}${participant.editingNodeId === node.id ? "が編集中" : "が選択中"}`}
                        >
                          {participant.name.slice(0, 1)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {participants
              .filter((participant) => participant.connectionId !== 0 && participant.cursor)
              .map((participant) => (
                <div
                  className="remote-cursor"
                  key={`cursor-${participant.connectionId}`}
                  style={{
                    left: participant.cursor?.x,
                    top: participant.cursor?.y,
                    color: participant.color,
                  }}
                >
                  <MousePointer2 size={20} fill="currentColor" />
                  <span style={{ background: participant.color }}>{participant.name}</span>
                </div>
              ))}
          </div>

          <div className="zoom-controls">
            <button type="button" onClick={() => zoomBy(-0.1)} aria-label="縮小">
              <ZoomOut size={17} />
            </button>
            <button type="button" onClick={resetView} aria-label="表示を戻す">
              <Maximize size={17} />
              {Math.round(transform.scale * 100)}%
            </button>
            <button type="button" onClick={() => zoomBy(0.1)} aria-label="拡大">
              <ZoomIn size={17} />
            </button>
          </div>

          <div className="selection-panel">
            <strong>{selectedNodes.length > 1 ? `${selectedNodes.length}個選択中` : selectedNode ? levelLabel(selectedDepth) : "未選択"}</strong>
            <span>{selectedNode?.text || "ノードを選択してください"}</span>
            {mode === "view" ? (
              <em>
                <Lock size={14} />
                閲覧専用リンクです
              </em>
            ) : null}
            <em>
              {connectionStatus === "connected" && isSynced ? "保存完了" : statusText}
            </em>
          </div>
        </div>
      </section>

      {isStyleOpen ? (
        <StylePanel
          selectedNodes={selectedNodes}
          canEdit={canEdit}
          hasCopiedStyle={Boolean(copiedStyle)}
          onPatchStyle={patchSelectedStyles}
          onPatchNode={patchSelectedNodeFields}
          onCopyStyle={copyStyle}
          onPasteStyle={pasteStyle}
          onApplyScope={applyStyleScope}
          onClose={() => setIsStyleOpen(false)}
        />
      ) : (
        <button className="style-open-button" type="button" onClick={() => setIsStyleOpen(true)} aria-label="スタイルパネルを開く">
          <PanelRightOpen size={18} />
          スタイル
        </button>
      )}

      {toast ? <div className="toast">{toast}</div> : null}

      {isShareOpen && shareLinks ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsShareOpen(false)}>
          <section className="share-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>共有リンク</h2>
                <p>同じroomIdに入るとリアルタイムで同期されます。</p>
              </div>
              <button type="button" onClick={() => setIsShareOpen(false)}>
                <Minus size={18} />
              </button>
            </div>
            {shareLinks.editUrl ? (
              <ShareField label="編集可能リンク" value={shareLinks.editUrl} />
            ) : null}
            <ShareField label="閲覧専用リンク" value={shareLinks.viewUrl} />
          </section>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importJson(file);
          event.currentTarget.value = "";
        }}
      />
    </main>
  );
}

function ShareField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <label className="share-field">
      <span>{label}</span>
      <div>
        <input value={value} readOnly />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          <Copy size={16} />
          {copied ? "コピー済み" : "コピー"}
        </button>
      </div>
    </label>
  );
}

function branchPath(parent: MindNode, child: MindNode) {
  const rightSide = child.x >= parent.x;
  const startX = parent.x + (rightSide ? parent.width : 0);
  const startY = parent.y + parent.height / 2;
  const endX = child.x + (rightSide ? 0 : child.width);
  const endY = child.y + child.height / 2;
  const bend = Math.max(80, Math.abs(endX - startX) * 0.45);
  const c1 = startX + (rightSide ? bend : -bend);
  const c2 = endX - (rightSide ? bend : -bend);
  return `M ${startX} ${startY} C ${c1} ${startY}, ${c2} ${endY}, ${endX} ${endY}`;
}

function statusLabel(status: ConnectionStatus, synced: boolean) {
  if (status === "connected" && synced) return "接続中・保存済み";
  if (status === "reconnecting") return "再接続中";
  if (status === "disconnected") return "切断中";
  if (!synced) return "同期中";
  return "接続準備中";
}

function safeFileName(name: string) {
  return (name || "mindmap").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadDataUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

async function renderSnapshotToPng(snapshot: MindMapSnapshot) {
  const visible = visibleNodeIds(snapshot.nodes);
  const nodes = snapshot.nodes.filter((node) => visible.has(node.id));
  const bounds = calculateBounds(nodes);
  const svg = buildExportSvg(snapshot, bounds);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  const pixelRatio = 2;
  canvas.width = bounds.width * pixelRatio;
  canvas.height = bounds.height * pixelRatio;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvasを作成できませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(pixelRatio, pixelRatio);
  context.drawImage(image, 0, 0, bounds.width, bounds.height);
  URL.revokeObjectURL(url);
  return { dataUrl: canvas.toDataURL("image/png"), width: bounds.width, height: bounds.height };
}

function calculateBounds(nodes: MindNode[]) {
  if (!nodes.length) return { minX: 0, minY: 0, width: 1200, height: 800 };
  const padding = 120;
  const minX = Math.min(...nodes.map((node) => node.x)) - padding;
  const minY = Math.min(...nodes.map((node) => node.y)) - padding;
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding;
  return {
    minX,
    minY,
    width: Math.max(800, Math.ceil(maxX - minX)),
    height: Math.max(600, Math.ceil(maxY - minY)),
  };
}

function buildExportSvg(snapshot: MindMapSnapshot, bounds: { minX: number; minY: number; width: number; height: number }) {
  const visible = visibleNodeIds(snapshot.nodes);
  const nodes = snapshot.nodes.filter((node) => visible.has(node.id));
  const byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const defs = nodes
    .map((node) => {
      const style = normalizeStyle(node.style, node.color);
      if (style.backgroundMode !== "gradient") return "";
      if (style.gradientDirection === "radial") {
        return `<radialGradient id="bg-${node.id}"><stop offset="0%" stop-color="${style.gradientFrom}" stop-opacity="${style.backgroundOpacity}"/><stop offset="100%" stop-color="${style.gradientTo}" stop-opacity="${style.backgroundOpacity}"/></radialGradient>`;
      }
      const coords =
        style.gradientDirection === "vertical"
          ? `x1="0%" y1="0%" x2="0%" y2="100%"`
          : style.gradientDirection === "diagonal"
            ? `x1="0%" y1="0%" x2="100%" y2="100%"`
            : `x1="0%" y1="0%" x2="100%" y2="0%"`;
      return `<linearGradient id="bg-${node.id}" ${coords}><stop offset="0%" stop-color="${style.gradientFrom}" stop-opacity="${style.backgroundOpacity}"/><stop offset="100%" stop-color="${style.gradientTo}" stop-opacity="${style.backgroundOpacity}"/></linearGradient>`;
    })
    .join("");
  const branchMarkup = nodes
    .filter((node) => node.parentId && visible.has(node.parentId))
    .map((node) => {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      return parent
        ? `<path d="${branchPath(parent, node)}" fill="none" stroke="${node.branchColor}" stroke-width="5" stroke-linecap="round"/>`
        : "";
    })
    .join("");
  const nodeMarkup = nodes
    .map((node) => {
      const style = normalizeStyle(node.style, node.color);
      const lines = wrapText(node.text, Math.max(8, Math.floor(node.width / Math.max(10, style.fontSize * 0.65)))).slice(0, 5);
      const fill =
        style.backgroundMode === "none"
          ? "transparent"
          : style.backgroundMode === "gradient"
            ? `url(#bg-${node.id})`
            : hexToRgba(style.backgroundColor, style.backgroundOpacity);
      const textX = style.textAlign === "left" ? 18 : style.textAlign === "right" ? node.width - 18 : node.width / 2;
      const anchor = style.textAlign === "left" ? "start" : style.textAlign === "right" ? "end" : "middle";
      const decoration = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ");
      const shape = exportShapeMarkup(node, style, fill);
      const transformText = style.writingMode === "vertical" ? ` transform="translate(${node.width / 2} 22)" writing-mode="tb"` : "";
      return `<g transform="translate(${node.x},${node.y})">
        ${shape}
        <text x="${textX}" y="${style.writingMode === "vertical" ? 0 : 34}" font-size="${style.fontSize}" font-family="${escapeXml(style.fontFamily)}" fill="${hexToRgba(style.textColor, style.textOpacity)}" font-weight="${style.fontWeight}" font-style="${style.italic ? "italic" : "normal"}" text-anchor="${anchor}" text-decoration="${decoration || "none"}"${transformText}>
          ${lines.map((line, index) => `<tspan x="${style.writingMode === "vertical" ? 0 : textX}" dy="${index === 0 ? 0 : style.fontSize * style.lineHeight}">${escapeXml(applyTextTransform(line, style.textTransform))}</tspan>`).join("")}
        </text>
      </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">
    <defs>${defs}</defs>
    <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>
    <text x="${bounds.minX + 24}" y="${bounds.minY + 40}" font-size="22" font-family="sans-serif" fill="#0f172a">${escapeXml(snapshot.title)}</text>
    ${branchMarkup}
    ${nodeMarkup}
  </svg>`;
}

function exportShapeMarkup(node: MindNode, style: NodeStyle, fill: string) {
  const stroke = style.borderStyle === "none" || style.shape === "none" ? "none" : hexToRgba(style.borderColor, style.borderOpacity);
  const strokeWidth = style.borderStyle === "none" || style.shape === "none" ? 0 : style.borderStyle === "heavy" ? Math.max(6, style.borderWidth) : style.borderWidth;
  const dash = style.borderStyle === "dashed" ? ` stroke-dasharray="12 8"` : style.borderStyle === "dotted" ? ` stroke-dasharray="2 7"` : "";
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}`;
  if (style.shape === "underline") {
    return `<rect x="0" y="0" width="${node.width}" height="${node.height}" fill="transparent"/><line x1="0" y1="${node.height - 4}" x2="${node.width}" y2="${node.height - 4}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}"${dash}/>`;
  }
  if (style.shape === "none") {
    return `<rect x="0" y="0" width="${node.width}" height="${node.height}" fill="transparent"/>`;
  }
  if (style.shape === "diamond") {
    return `<polygon points="${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}" ${common}/>`;
  }
  if (style.shape === "hexagon") {
    return `<polygon points="${node.width * 0.18},0 ${node.width * 0.82},0 ${node.width},${node.height / 2} ${node.width * 0.82},${node.height} ${node.width * 0.18},${node.height} 0,${node.height / 2}" ${common}/>`;
  }
  if (style.shape === "speech") {
    return `<polygon points="0,0 ${node.width},0 ${node.width},${node.height * 0.82} ${node.width * 0.68},${node.height * 0.82} ${node.width * 0.58},${node.height} ${node.width * 0.48},${node.height * 0.82} 0,${node.height * 0.82}" ${common}/>`;
  }
  if (style.shape === "sticky") {
    return `<polygon points="0,0 ${node.width},0 ${node.width},${node.height * 0.78} ${node.width * 0.78},${node.height} 0,${node.height}" ${common}/>`;
  }
  if (style.shape === "circle" || style.shape === "ellipse") {
    return `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" ${common}/>`;
  }
  const radius = radiusForShape(style.shape, style.borderRadius);
  return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="${radius}" ${common}/>`;
}

function applyTextTransform(text: string, transform: NodeStyle["textTransform"]) {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  return text;
}

function wrapText(text: string, length: number) {
  const lines: string[] = [];
  let current = "";
  for (const char of text || " ") {
    current += char;
    if (current.length >= length) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function readSavedDefaultStyle() {
  try {
    const raw = window.localStorage.getItem("mindmap:default-style");
    return raw ? normalizeStyle(JSON.parse(raw) as Partial<NodeStyle>) : null;
  } catch {
    return null;
  }
}

function loadBlankMap(transact: (fn: (doc: Y.Doc) => void) => void) {
  const blank: MindMapSnapshot = {
    title: "新しいマインドマップ",
    nodes: [
      newNode({
        id: ROOT_NODE_ID,
        parentId: null,
        text: "中心テーマ",
        x: 4100,
        y: 4200,
        color: "#2563eb",
        branchColor: "#38bdf8",
        style: defaultNodeStyle,
      }),
    ],
  };
  transact((doc) => replaceDocument(doc, blank, LOCAL_ORIGIN));
  window.localStorage.setItem("mindmap:guide-seen", "yes");
}

function loadSampleMap(transact: (fn: (doc: Y.Doc) => void) => void) {
  const baseStyle = normalizeStyle(defaultNodeStyle);
  const sample: MindMapSnapshot = {
    title: "新サービス企画",
    nodes: [
      newNode({
        id: ROOT_NODE_ID,
        parentId: null,
        text: "新サービス企画",
        x: 4100,
        y: 4200,
        color: "#2563eb",
        branchColor: "#38bdf8",
        style: { ...baseStyle, backgroundMode: "gradient", gradientFrom: "#dbeafe", gradientTo: "#dcfce7", fontSize: 18 },
      }),
      newNode({
        id: "sample-users",
        parentId: ROOT_NODE_ID,
        text: "利用者",
        x: 4400,
        y: 4020,
        color: "#0ea5e9",
        branchColor: "#0ea5e9",
        style: { ...baseStyle, borderColor: "#0ea5e9", backgroundColor: "#f0f9ff" },
      }),
      newNode({
        id: "sample-value",
        parentId: ROOT_NODE_ID,
        text: "価値",
        x: 4400,
        y: 4200,
        color: "#16a34a",
        branchColor: "#16a34a",
        style: { ...baseStyle, borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
      }),
      newNode({
        id: "sample-plan",
        parentId: ROOT_NODE_ID,
        text: "実行計画",
        x: 4400,
        y: 4380,
        color: "#0891b2",
        branchColor: "#0891b2",
        style: { ...baseStyle, borderColor: "#0891b2", backgroundColor: "#ecfeff" },
      }),
      newNode({
        id: "sample-target",
        parentId: "sample-users",
        text: "初心者にも分かりやすい",
        x: 4690,
        y: 3970,
        color: "#0ea5e9",
        branchColor: "#0ea5e9",
        style: { ...baseStyle, borderColor: "#7dd3fc", shape: "capsule" },
      }),
      newNode({
        id: "sample-share",
        parentId: "sample-value",
        text: "共同編集で早く整理",
        x: 4690,
        y: 4200,
        color: "#16a34a",
        branchColor: "#16a34a",
        style: { ...baseStyle, borderColor: "#86efac", shape: "sticky" },
      }),
      newNode({
        id: "sample-next",
        parentId: "sample-plan",
        text: "試作 → 共有 → 改善",
        x: 4690,
        y: 4380,
        color: "#0891b2",
        branchColor: "#0891b2",
        style: { ...baseStyle, borderColor: "#67e8f9", shape: "hexagon" },
      }),
    ],
  };
  transact((doc) => replaceDocument(doc, sample, LOCAL_ORIGIN));
  window.localStorage.setItem("mindmap:guide-seen", "yes");
}
