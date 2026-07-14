"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Copy, ExternalLink, Loader2, Plus, UserRound } from "lucide-react";
import type { RecentMap } from "@/types/mindmap";
import { getRecentMaps, getUserName, saveCreatedLinks, setUserName } from "@/lib/local";
import { ThemeToggle } from "@/components/ThemeToggle";

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

export function HomePage() {
  const [title, setTitle] = useState("新しいマインドマップ");
  const [name, setName] = useState("ゲスト");
  const [recentMaps, setRecentMaps] = useState<RecentMap[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(getUserName());
    setRecentMaps(getRecentMaps());
  }, []);

  async function createMap() {
    setIsCreating(true);
    setError("");
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

  return (
    <main className="home">
      <header className="home-topbar">
        <div className="brand-row compact">
          <div className="brand-icon">M</div>
          <span>みんなのマインドマップ</span>
        </div>
        <ThemeToggle />
      </header>
      <section className="home-hero">
        <div className="home-copy">
          <div className="brand-row">
            <div className="brand-icon">M</div>
            <span>みんなのマインドマップ</span>
          </div>
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
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-title">
          <h2>最近開いたマップ</h2>
        </div>
        {recentMaps.length ? (
          <div className="recent-grid">
            {recentMaps.map((map) => (
              <article className="recent-card" key={map.roomId}>
                <div>
                  <h3>{map.title}</h3>
                  <p>{map.roomId}</p>
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
                    onClick={() => navigator.clipboard?.writeText(map.editUrl ?? map.viewUrl)}
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
    </main>
  );
}
