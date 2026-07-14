"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  LogOut,
  Loader2,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { RecentMap } from "@/types/mindmap";
import {
  getAdminToken,
  getRecentMaps,
  getUserName,
  pendingImportKey,
  removeRecentMap,
  saveCreatedLinks,
  setAdminToken,
  setUserName,
} from "@/lib/local";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DocumentImportDialog } from "@/components/DocumentImportDialog";
import { generatedMapToSnapshot } from "@/lib/generatedMap";
import type { DocumentGenerationApplyMode, GeneratedMindMap } from "@/types/mindmap";

type CreateRoomResponse = {
  roomId: string;
  title: string;
  editUrl: string;
  viewUrl: string;
  editToken: string;
  viewToken: string;
  ownerToken?: string;
  error?: string;
  message?: string;
};

type DeleteMapResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type AdminVerifyResponse = {
  ok?: boolean;
  message?: string;
};

function normalizeMapName(value: string) {
  return value.trim().normalize("NFKC");
}

export function HomePage() {
  const [title, setTitle] = useState("新しいマインドマップ");
  const [name, setName] = useState("ゲスト");
  const [recentMaps, setRecentMaps] = useState<RecentMap[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminTokenValue, setAdminTokenValue] = useState("");
  const [openMenuRoomId, setOpenMenuRoomId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecentMap | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDocumentImportOpen, setIsDocumentImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [adminTokenError, setAdminTokenError] = useState("");
  const [showAdminToken, setShowAdminToken] = useState(false);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);

  useEffect(() => {
    setName(getUserName());
    setRecentMaps(getRecentMaps());
    setAdminTokenValue(getAdminToken());
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const isAdminMode = Boolean(adminTokenValue.trim());
  const currentDeleteTarget = deleteTarget;
  const normalizedDeleteInput = normalizeMapName(deleteConfirmName);
  const normalizedDeleteName = currentDeleteTarget ? normalizeMapName(currentDeleteTarget.title) : "";
  const deleteNameMatches =
    Boolean(currentDeleteTarget) &&
    normalizedDeleteInput.length > 0 &&
    normalizedDeleteInput === normalizedDeleteName;
  const hasDeleteCredential = currentDeleteTarget
    ? Boolean(currentDeleteTarget.ownerToken || isAdminMode)
    : false;
  const deleteDisabledReason = !currentDeleteTarget
    ? ""
    : !hasDeleteCredential
      ? "このマップを削除する権限がありません。"
      : !deleteConfirmName.trim()
        ? "削除するにはマップ名を入力してください。"
        : !deleteNameMatches
          ? "入力したマップ名が一致していません。"
          : "";

  async function createMap() {
    setIsCreating(true);
    setError("");
    setNotice("");
    setUserName(name);

    try {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = (await response.json()) as CreateRoomResponse;
      if (!response.ok) {
        throw new Error(data.message || "マップを作成できませんでした。");
      }
      saveCreatedLinks({ ...data, title: data.title });
      window.location.href = data.editUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "マップを作成できませんでした。");
    } finally {
      setIsCreating(false);
    }
  }

  function openDeleteDialog(map: RecentMap) {
    setDeleteTarget(map);
    setDeleteConfirmName("");
    setDeleteError("");
    setOpenMenuRoomId(null);
  }

  async function copyLink(value: string) {
    try {
      await navigator.clipboard?.writeText(value);
      setNotice("リンクをコピーしました");
    } catch {
      setNotice("リンクをコピーできませんでした");
    }
  }

  async function deleteMap() {
    if (!currentDeleteTarget || deleteDisabledReason || isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(
        `/api/admin/maps/${encodeURIComponent(currentDeleteTarget.roomId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerToken: currentDeleteTarget.ownerToken ?? "",
            adminToken: isAdminMode ? adminTokenValue.trim() : "",
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as DeleteMapResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "マップを削除できませんでした。");
      }

      removeRecentMap(currentDeleteTarget.roomId);
      setRecentMaps(getRecentMaps());
      setDeleteTarget(null);
      setDeleteConfirmName("");
      setNotice("マップを削除しました");
      if (window.location.pathname.startsWith(`/map/${currentDeleteTarget.roomId}`)) {
        window.location.href = "/";
      }
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "マップを削除できませんでした。");
    } finally {
      setIsDeleting(false);
    }
  }

  function openAdminDialog() {
    setAdminTokenInput("");
    setAdminTokenError("");
    setShowAdminToken(false);
    setIsSettingsOpen(false);
    setIsAdminDialogOpen(true);
  }

  async function verifyAdminToken() {
    const token = adminTokenInput.trim();
    if (!token) {
      setAdminTokenError("管理者トークンを入力してください");
      return;
    }

    setIsVerifyingAdmin(true);
    setAdminTokenError("");
    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminToken: token }),
      });
      const data = (await response.json().catch(() => ({}))) as AdminVerifyResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "管理者トークンが正しくありません");
      }
      setAdminTokenValue(token);
      setAdminToken(token);
      setAdminTokenInput("");
      setIsAdminDialogOpen(false);
      setNotice("管理者モードを有効にしました");
    } catch (caught) {
      setAdminTokenError(
        caught instanceof Error ? caught.message : "管理者トークンが正しくありません",
      );
    } finally {
      setIsVerifyingAdmin(false);
    }
  }

  function exitAdminMode() {
    setAdminTokenValue("");
    setAdminToken("");
    setAdminTokenInput("");
    setIsSettingsOpen(false);
    setNotice("管理者モードを終了しました");
  }

  async function createMapFromDocument(map: GeneratedMindMap, mode: DocumentGenerationApplyMode) {
    if (mode !== "new") return;
    setNotice("");
    const response = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: map.title || "資料から作成" }),
    });
    const data = (await response.json()) as CreateRoomResponse;
    if (!response.ok || !data.editUrl) {
      throw new Error(data.message || "マップを作成できませんでした。");
    }
    window.localStorage.setItem(pendingImportKey(data.roomId), JSON.stringify(generatedMapToSnapshot(map)));
    saveCreatedLinks({ ...data, title: data.title });
    window.location.href = data.editUrl;
  }

  return (
    <main className="home">
      <header className="home-topbar">
        <div className="brand-row compact">
          <div className="brand-icon">M</div>
          <span>みんなのマインドマップ</span>
        </div>
        <div className="home-topbar-actions">
          {isAdminMode ? (
            <span className="admin-mode-pill">
              <ShieldCheck size={15} />
              管理者モード中
            </span>
          ) : null}
          <ThemeToggle />
          <div className="settings-menu-wrap">
            <button
              type="button"
              className="settings-button"
              aria-label="設定メニュー"
              aria-expanded={isSettingsOpen}
              onClick={() => setIsSettingsOpen((current) => !current)}
            >
              <Settings size={18} />
            </button>
            {isSettingsOpen ? (
              <div className="settings-menu">
                {isAdminMode ? (
                  <button type="button" onClick={exitAdminMode}>
                    <LogOut size={16} />
                    管理者モードを終了
                  </button>
                ) : (
                  <button type="button" onClick={openAdminDialog}>
                    <ShieldCheck size={16} />
                    管理者モード
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <section className="home-hero">
        <div className="home-copy">
          <h1>共有リンクだけで、同じマップを一緒に編集。</h1>
          <p>
            ノードの追加、文字編集、移動、色、折りたたみまでLiveblocksとYjsでリアルタイム同期します。
          </p>
        </div>

        <div className="create-panel">
          <label>
            <span>あなたの表示名</span>
            <div className="input-with-icon">
              <UserRound size={18} />
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </label>
          <label>
            <span>マップ名</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button className="primary-action" onClick={createMap} disabled={isCreating}>
            {isCreating ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            新しいマップを作成
          </button>
          <button className="secondary-action" type="button" onClick={() => setIsDocumentImportOpen(true)}>
            <FileText size={18} />
            資料から作成
          </button>
          {error ? <p className="error-text">{error}</p> : null}
          {notice ? <p className="notice">{notice}</p> : null}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-title">
          <div>
            <h2>最近開いたマップ</h2>
            <p>作成したマップは「...」メニューから削除できます。</p>
          </div>
        </div>
        {recentMaps.length ? (
          <div className="recent-grid">
            {recentMaps.map((map) => (
              <article className="recent-card" key={map.roomId}>
                <div className="recent-card-head">
                  <div>
                    <h3>{map.title}</h3>
                    <p>{map.roomId}</p>
                  </div>
                  <div className="map-menu-wrap">
                    <button
                      type="button"
                      className="map-menu-button"
                      aria-label={`${map.title}の操作メニュー`}
                      aria-expanded={openMenuRoomId === map.roomId}
                      onClick={() =>
                        setOpenMenuRoomId(openMenuRoomId === map.roomId ? null : map.roomId)
                      }
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {openMenuRoomId === map.roomId ? (
                      <div className="map-menu" role="menu">
                        <button
                          type="button"
                          className="delete-map-menu-button"
                          onClick={() => openDeleteDialog(map)}
                          disabled={!map.ownerToken && !isAdminMode}
                        >
                          <Trash2 size={16} />
                          マップを削除
                        </button>
                        {!map.ownerToken && !isAdminMode ? (
                          <p className="menu-disabled-reason">
                            このマップを削除する権限がありません。
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="recent-actions">
                  {map.editUrl ? (
                    <a href={map.editUrl}>
                      <ArrowRight size={16} />
                      編集
                    </a>
                  ) : null}
                  <a href={map.viewUrl}>
                    <ExternalLink size={16} />
                    閲覧
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(map.editUrl ?? map.viewUrl)}
                  >
                    <Copy size={16} />
                    コピー
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">作成したマップがここに表示されます。</div>
        )}
      </section>
      {currentDeleteTarget ? (
        <div className="modal-backdrop" role="presentation">
          <div className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="modal-head">
              <div>
                <h2 id="delete-title">このマップを完全に削除しますか？</h2>
                <p>削除すると元に戻せません。Liveblocks上の共同編集データも削除されます。</p>
              </div>
              <button
                type="button"
                className="icon-only"
                aria-label="削除確認を閉じる"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="delete-warning">
              <AlertTriangle size={20} />
              <div>
                <span>削除対象のマップ名</span>
                <strong>{currentDeleteTarget.title}</strong>
              </div>
            </div>

            <label className="delete-confirm-field">
              <span>確認のため、上のマップ名を入力してください。</span>
              <input
                value={deleteConfirmName}
                onChange={(event) => setDeleteConfirmName(event.target.value)}
                placeholder={currentDeleteTarget.title}
                disabled={isDeleting}
                autoFocus
              />
            </label>

            {deleteError ? <p className="delete-error">{deleteError}</p> : null}

            <div className="delete-actions">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                キャンセル
              </button>
              <button
                type="button"
                className="delete-submit"
                onClick={deleteMap}
                disabled={Boolean(deleteDisabledReason) || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="spin" size={16} />
                    削除中...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    マップを削除
                  </>
                )}
              </button>
            </div>
            {deleteDisabledReason ? (
              <p className="delete-disabled-reason">{deleteDisabledReason}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {isAdminDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title">
            <div className="modal-head">
              <div>
                <h2 id="admin-title">管理者モード</h2>
                <p>管理者用の操作が必要な場合だけ入力してください。</p>
              </div>
              <button
                type="button"
                className="icon-only"
                aria-label="管理者モードを閉じる"
                onClick={() => setIsAdminDialogOpen(false)}
                disabled={isVerifyingAdmin}
              >
                <X size={18} />
              </button>
            </div>

            <label className="admin-token-dialog-field">
              <span>トークン</span>
              <div className="password-row">
                <input
                  type={showAdminToken ? "text" : "password"}
                  value={adminTokenInput}
                  onChange={(event) => setAdminTokenInput(event.target.value)}
                  autoComplete="off"
                  disabled={isVerifyingAdmin}
                />
                <button
                  type="button"
                  aria-label={showAdminToken ? "非表示にする" : "表示する"}
                  onClick={() => setShowAdminToken((current) => !current)}
                  disabled={isVerifyingAdmin}
                >
                  {showAdminToken ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {adminTokenError ? <p className="delete-error">{adminTokenError}</p> : null}

            <div className="delete-actions">
              <button
                type="button"
                onClick={() => setIsAdminDialogOpen(false)}
                disabled={isVerifyingAdmin}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={verifyAdminToken}
                disabled={isVerifyingAdmin}
              >
                {isVerifyingAdmin ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
                有効にする
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <DocumentImportDialog
        open={isDocumentImportOpen}
        context="home"
        onClose={() => setIsDocumentImportOpen(false)}
        onApply={createMapFromDocument}
      />
    </main>
  );
}
