"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  DocumentGenerationApplyMode,
  DocumentGenerationMethod,
  GeneratedMindMap,
  GeneratedMindMapNode,
} from "@/types/mindmap";

type DocumentImportDialogProps = {
  open: boolean;
  context: "home" | "map";
  canEdit?: boolean;
  selectedNodeName?: string;
  onClose: () => void;
  onApply: (map: GeneratedMindMap, mode: DocumentGenerationApplyMode) => Promise<void> | void;
};

type GenerateResponse = {
  map?: GeneratedMindMap;
  sourceText?: string;
  warning?: string;
  message?: string;
  aiConfigured?: boolean;
};

const methodOptions: Array<{ value: DocumentGenerationMethod; label: string }> = [
  { value: "brief", label: "簡潔に要約" },
  { value: "detailed", label: "詳しく要約" },
  { value: "key-points", label: "重要ポイントを抽出" },
  { value: "meeting", label: "会議資料として整理" },
  { value: "business-plan", label: "事業計画として整理" },
  { value: "problems-solutions", label: "課題と解決策に整理" },
  { value: "timeline", label: "時系列で整理" },
  { value: "custom", label: "自由形式で指示" },
];

const progressLabels = ["読み込み中", "テキスト抽出中", "要約中", "マインドマップ作成中"];

export function DocumentImportDialog({
  open,
  context,
  canEdit = true,
  selectedNodeName,
  onClose,
  onApply,
}: DocumentImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputKind, setInputKind] = useState<"text" | "file" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [method, setMethod] = useState<DocumentGenerationMethod>("brief");
  const [detail, setDetail] = useState<"short" | "normal" | "deep">("normal");
  const [maxDepth, setMaxDepth] = useState(4);
  const [maxTopLevel, setMaxTopLevel] = useState(8);
  const [maxChildren, setMaxChildren] = useState(8);
  const [customInstruction, setCustomInstruction] = useState("");
  const [draft, setDraft] = useState<GeneratedMindMap | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [selectedPath, setSelectedPath] = useState<number[] | null>(null);
  const [progress, setProgress] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyMode, setApplyMode] = useState<DocumentGenerationApplyMode>(
    context === "home" ? "new" : "append",
  );
  const [confirmReplace, setConfirmReplace] = useState(false);

  const selectedPreview = useMemo(
    () => (draft && selectedPath ? getNodeAtPath(draft.children, selectedPath) : null),
    [draft, selectedPath],
  );

  if (!open) return null;

  async function generate() {
    setError("");
    setWarning("");
    setIsGenerating(true);
    setProgress(progressLabels[0]);

    let progressIndex = 0;
    const timer = window.setInterval(() => {
      progressIndex = Math.min(progressLabels.length - 1, progressIndex + 1);
      setProgress(progressLabels[progressIndex]);
    }, 650);

    try {
      const formData = new FormData();
      formData.set("inputKind", inputKind);
      formData.set("text", text);
      formData.set("url", url);
      formData.set("method", method);
      formData.set("detail", detail);
      formData.set("maxDepth", String(maxDepth));
      formData.set("maxTopLevel", String(maxTopLevel));
      formData.set("maxChildren", String(maxChildren));
      formData.set("customInstruction", customInstruction);
      if (file) formData.set("file", file);

      const response = await fetch("/api/generate-map", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as GenerateResponse;
      if (!response.ok || !data.map) {
        throw new Error(data.message || "資料からマップを作成できませんでした。");
      }

      setDraft(data.map);
      setSourceText(data.sourceText ?? "");
      setSelectedPath(null);
      setWarning(
        data.warning ||
          (data.aiConfigured === false
            ? "AI要約を利用するにはAPI設定が必要です。簡易抽出で作成しました。"
            : ""),
      );
      setProgress("完了");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "資料からマップを作成できませんでした。");
      setProgress("");
    } finally {
      window.clearInterval(timer);
      setIsGenerating(false);
    }
  }

  async function apply() {
    if (!draft || isApplying) return;
    if (applyMode === "replace" && !confirmReplace) return;
    setIsApplying(true);
    try {
      await onApply(draft, applyMode);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "マップへ反映できませんでした。");
    } finally {
      setIsApplying(false);
    }
  }

  function updateDraft(patch: Partial<GeneratedMindMap>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  }

  function updateNode(path: number[], patch: Partial<GeneratedMindMapNode>) {
    if (!draft) return;
    setDraft({ ...draft, children: updateNodeAtPath(draft.children, path, (node) => ({ ...node, ...patch })) });
  }

  function addNode(path?: number[]) {
    if (!draft) return;
    const node: GeneratedMindMapNode = {
      title: "新しい項目",
      summary: "",
      sourceExcerpt: "",
      sourceLocation: "",
      importance: "medium",
      children: [],
    };
    if (!path) {
      setDraft({ ...draft, children: [...draft.children, node] });
      setSelectedPath([draft.children.length]);
      return;
    }
    setDraft({
      ...draft,
      children: updateNodeAtPath(draft.children, path, (current) => ({
        ...current,
        children: [...current.children, node],
      })),
    });
    setSelectedPath([...path, getNodeAtPath(draft.children, path)?.children.length ?? 0]);
  }

  function removeNode(path: number[]) {
    if (!draft) return;
    setDraft({ ...draft, children: removeNodeAtPath(draft.children, path).nodes });
    setSelectedPath(null);
  }

  function moveNode(path: number[], direction: -1 | 1) {
    if (!draft) return;
    const updated = moveNodeAtPath(draft.children, path, direction);
    setDraft({ ...draft, children: updated });
    const index = path[path.length - 1] + direction;
    setSelectedPath([...path.slice(0, -1), index]);
  }

  function indentNode(path: number[]) {
    if (!draft || path[path.length - 1] <= 0) return;
    const updated = indentNodeAtPath(draft.children, path);
    setDraft({ ...draft, children: updated.nodes });
    setSelectedPath(updated.path);
  }

  function outdentNode(path: number[]) {
    if (!draft || path.length < 2) return;
    const updated = outdentNodeAtPath(draft.children, path);
    setDraft({ ...draft, children: updated.nodes });
    setSelectedPath(updated.path);
  }

  const canApplyMode =
    context === "home" || applyMode === "new" || canEdit;

  return (
    <div className="modal-backdrop document-backdrop" role="presentation" onClick={onClose}>
      <section className="document-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>資料から作成</h2>
            <p>貼り付け、ファイル、URLから内容を整理してマインドマップにします。</p>
          </div>
          <button type="button" className="icon-only" onClick={onClose} aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="document-layout">
          <div className="document-form">
            <div className="step-label">1. 資料を追加</div>
            <div className="segmented input-tabs">
              <button type="button" className={inputKind === "text" ? "active" : ""} onClick={() => setInputKind("text")}>
                テキスト
              </button>
              <button type="button" className={inputKind === "file" ? "active" : ""} onClick={() => setInputKind("file")}>
                ファイル
              </button>
              <button type="button" className={inputKind === "url" ? "active" : ""} onClick={() => setInputKind("url")}>
                URL
              </button>
            </div>

            {inputKind === "text" ? (
              <label className="field">
                <span>テキスト貼り付け</span>
                <textarea
                  className="document-textarea"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="資料本文、議事録、Markdownなどを貼り付けてください。"
                />
              </label>
            ) : null}

            {inputKind === "file" ? (
              <div
                className="drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <Upload size={22} />
                <strong>{file ? file.name : "ファイルを選択またはドラッグ"}</strong>
                <span>TXT、PDF、Word（.docx） / 10MBまで</span>
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  ファイルを選択
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  hidden
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
            ) : null}

            {inputKind === "url" ? (
              <label className="field">
                <span>URLを入力</span>
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" />
              </label>
            ) : null}

            <div className="step-label">2. 作成方法</div>
            <label className="field">
              <span>作成方法</span>
              <select value={method} onChange={(event) => setMethod(event.target.value as DocumentGenerationMethod)}>
                {methodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {method === "custom" ? (
              <label className="field">
                <span>自由形式の指示</span>
                <input
                  value={customInstruction}
                  onChange={(event) => setCustomInstruction(event.target.value)}
                  placeholder="例：初心者向けに5つの大項目へ整理"
                />
              </label>
            ) : null}

            <div className="document-settings">
              <label className="field">
                <span>要約の詳しさ</span>
                <select value={detail} onChange={(event) => setDetail(event.target.value as typeof detail)}>
                  <option value="short">短め</option>
                  <option value="normal">標準</option>
                  <option value="deep">詳しめ</option>
                </select>
              </label>
              <label className="field">
                <span>階層の深さ</span>
                <input type="number" min={2} max={4} value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))} />
              </label>
              <label className="field">
                <span>大項目</span>
                <input type="number" min={1} max={12} value={maxTopLevel} onChange={(event) => setMaxTopLevel(Number(event.target.value))} />
              </label>
              <label className="field">
                <span>子項目</span>
                <input type="number" min={1} max={12} value={maxChildren} onChange={(event) => setMaxChildren(Number(event.target.value))} />
              </label>
            </div>

            <button type="button" className="primary-action" onClick={generate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
              {draft ? "生成をやり直す" : "作成前プレビューを作る"}
            </button>
            {progress ? <div className="progress-line">{progress}</div> : null}
            {warning ? <p className="document-warning">{warning}</p> : null}
            {error ? <p className="delete-error">{error}</p> : null}
          </div>

          <div className="document-preview">
            <div className="step-label">3. プレビューして反映</div>
            {draft ? (
              <>
                <label className="field">
                  <span>中心テーマ</span>
                  <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
                </label>
                <label className="field">
                  <span>資料全体の要約</span>
                  <textarea
                    className="summary-textarea"
                    value={draft.summary}
                    onChange={(event) => updateDraft({ summary: event.target.value })}
                  />
                </label>
                <div className="preview-toolbar">
                  <button type="button" onClick={() => addNode()}>
                    <Plus size={15} />
                    大項目を追加
                  </button>
                  <button type="button" onClick={generate} disabled={isGenerating}>
                    <RefreshCw size={15} />
                    やり直す
                  </button>
                </div>
                <div className="preview-tree">
                  {draft.children.map((node, index) => (
                    <PreviewNode
                      key={`${index}-${node.title}`}
                      node={node}
                      path={[index]}
                      selectedPath={selectedPath}
                      onSelect={setSelectedPath}
                      onUpdate={updateNode}
                      onAdd={addNode}
                      onDelete={removeNode}
                      onMove={moveNode}
                      onIndent={indentNode}
                      onOutdent={outdentNode}
                    />
                  ))}
                </div>

                <div className="source-compare">
                  <div>
                    <strong>元資料</strong>
                    <p>{sourceText || "元資料の抜粋はありません。"}</p>
                  </div>
                  <div>
                    <strong>選択中の要約</strong>
                    <p>{selectedPreview?.summary || draft.summary || "項目を選択してください。"}</p>
                    <em>{selectedPreview?.sourceLocation || "全体"}</em>
                  </div>
                </div>

                <label className="field">
                  <span>反映方法</span>
                  <select
                    value={applyMode}
                    onChange={(event) => {
                      setApplyMode(event.target.value as DocumentGenerationApplyMode);
                      setConfirmReplace(false);
                    }}
                  >
                    <option value="new">新しいマップとして作成</option>
                    {context === "map" ? <option value="append">現在のマップへ追加</option> : null}
                    {context === "map" ? <option value="under-selected">選択中のノードの配下へ追加</option> : null}
                    {context === "map" ? <option value="replace">現在の内容を置き換える</option> : null}
                  </select>
                </label>
                {applyMode === "under-selected" ? (
                  <p className="document-hint">追加先: {selectedNodeName || "選択中のノード"}</p>
                ) : null}
                {applyMode === "replace" ? (
                  <label className="confirm-line">
                    <input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} />
                    現在の内容を置き換えることを確認しました
                  </label>
                ) : null}
                {!canApplyMode ? <p className="delete-disabled-reason">閲覧専用では現在のマップへ反映できません。</p> : null}
                <button
                  type="button"
                  className="primary-action"
                  onClick={apply}
                  disabled={!canApplyMode || isApplying || (applyMode === "replace" && !confirmReplace)}
                >
                  {isApplying ? <Loader2 className="spin" size={17} /> : <FileText size={17} />}
                  マップへ反映
                </button>
              </>
            ) : (
              <div className="preview-empty">
                <FileText size={28} />
                <strong>生成結果をここで確認できます</strong>
                <span>作成前プレビューを作ると、項目名や階層を編集できます。</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewNode({
  node,
  path,
  selectedPath,
  onSelect,
  onUpdate,
  onAdd,
  onDelete,
  onMove,
  onIndent,
  onOutdent,
}: {
  node: GeneratedMindMapNode;
  path: number[];
  selectedPath: number[] | null;
  onSelect: (path: number[]) => void;
  onUpdate: (path: number[], patch: Partial<GeneratedMindMapNode>) => void;
  onAdd: (path: number[]) => void;
  onDelete: (path: number[]) => void;
  onMove: (path: number[], direction: -1 | 1) => void;
  onIndent: (path: number[]) => void;
  onOutdent: (path: number[]) => void;
}) {
  const selected = pathKey(path) === pathKey(selectedPath ?? []);
  return (
    <div className={`preview-node ${selected ? "selected" : ""}`}>
      <div className="preview-node-main" onClick={() => onSelect(path)}>
        <input value={node.title} onChange={(event) => onUpdate(path, { title: event.target.value })} />
        <textarea value={node.summary} onChange={(event) => onUpdate(path, { summary: event.target.value })} placeholder="短い説明" />
      </div>
      <div className="preview-node-actions">
        <button type="button" onClick={() => onAdd(path)} title="項目を追加">
          <Plus size={14} />
        </button>
        <button type="button" onClick={() => onMove(path, -1)} title="上へ">
          <ArrowUp size={14} />
        </button>
        <button type="button" onClick={() => onMove(path, 1)} title="下へ">
          <ArrowDown size={14} />
        </button>
        <button type="button" onClick={() => onOutdent(path)} title="階層を上げる">
          <ArrowLeft size={14} />
        </button>
        <button type="button" onClick={() => onIndent(path)} title="前の項目の配下へ">
          <ArrowRight size={14} />
        </button>
        <button type="button" className="danger" onClick={() => onDelete(path)} title="削除">
          <Trash2 size={14} />
        </button>
      </div>
      {node.children.length ? (
        <div className="preview-children">
          {node.children.map((child, index) => (
            <PreviewNode
              key={`${index}-${child.title}`}
              node={child}
              path={[...path, index]}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onAdd={onAdd}
              onDelete={onDelete}
              onMove={onMove}
              onIndent={onIndent}
              onOutdent={onOutdent}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function pathKey(path: number[]) {
  return path.join(".");
}

function getNodeAtPath(nodes: GeneratedMindMapNode[], path: number[]) {
  let current: GeneratedMindMapNode | undefined;
  let list = nodes;
  for (const index of path) {
    current = list[index];
    if (!current) return null;
    list = current.children;
  }
  return current ?? null;
}

function updateNodeAtPath(
  nodes: GeneratedMindMapNode[],
  path: number[],
  updater: (node: GeneratedMindMapNode) => GeneratedMindMapNode,
): GeneratedMindMapNode[] {
  if (!path.length) return nodes;
  const [index, ...rest] = path;
  return nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) return node;
    if (!rest.length) return updater(node);
    return { ...node, children: updateNodeAtPath(node.children, rest, updater) };
  });
}

function removeNodeAtPath(nodes: GeneratedMindMapNode[], path: number[]): { nodes: GeneratedMindMapNode[]; removed?: GeneratedMindMapNode } {
  if (path.length === 1) {
    const next = [...nodes];
  const [removed] = next.splice(path[0], 1);
    return { nodes: next, removed };
  }
  const [index, ...rest] = path;
  let removedNode: GeneratedMindMapNode | undefined;
  return {
    nodes: nodes.map((node, nodeIndex) => {
      if (nodeIndex !== index) return node;
      const result = removeNodeAtPath(node.children, rest);
      removedNode = result.removed;
      return { ...node, children: result.nodes };
    }),
    removed: removedNode,
  };
}

function moveNodeAtPath(
  nodes: GeneratedMindMapNode[],
  path: number[],
  direction: -1 | 1,
): GeneratedMindMapNode[] {
  if (path.length === 1) {
    const index = path[0];
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return nodes;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  const [index, ...rest] = path;
  return nodes.map((node, nodeIndex) =>
    nodeIndex === index ? { ...node, children: moveNodeAtPath(node.children, rest, direction) } : node,
  );
}

function insertNodeAt(
  nodes: GeneratedMindMapNode[],
  parentPath: number[],
  index: number,
  node: GeneratedMindMapNode,
): GeneratedMindMapNode[] {
  if (!parentPath.length) {
    const next = [...nodes];
    next.splice(index, 0, node);
    return next;
  }
  const [head, ...rest] = parentPath;
  return nodes.map((item, itemIndex) =>
    itemIndex === head ? { ...item, children: insertNodeAt(item.children, rest, index, node) } : item,
  );
}

function indentNodeAtPath(
  nodes: GeneratedMindMapNode[],
  path: number[],
): { nodes: GeneratedMindMapNode[]; path: number[] } {
  const index = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const previousSiblingPath = [...parentPath, index - 1];
  const removed = removeNodeAtPath(nodes, path);
  if (!removed.removed) return { nodes, path };
  const previous = getNodeAtPath(removed.nodes, previousSiblingPath);
  const nextNodes = updateNodeAtPath(removed.nodes, previousSiblingPath, (node) => ({
    ...node,
    children: [...node.children, removed.removed as GeneratedMindMapNode],
  }));
  return { nodes: previous ? nextNodes : nodes, path: [...previousSiblingPath, previous?.children.length ?? 0] };
}

function outdentNodeAtPath(
  nodes: GeneratedMindMapNode[],
  path: number[],
): { nodes: GeneratedMindMapNode[]; path: number[] } {
  const parentPath = path.slice(0, -1);
  const grandPath = path.slice(0, -2);
  const parentIndex = parentPath[parentPath.length - 1];
  const removed = removeNodeAtPath(nodes, path);
  if (!removed.removed) return { nodes, path };
  const nextPath = [...grandPath, parentIndex + 1];
  return {
    nodes: insertNodeAt(removed.nodes, grandPath, parentIndex + 1, removed.removed),
    path: nextPath,
  };
}
