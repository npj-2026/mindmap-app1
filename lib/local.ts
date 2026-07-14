import type { RecentMap, ShareLinks } from "@/types/mindmap";

const userIdKey = "mindmap:user-id";
const userNameKey = "mindmap:user-name";
const recentMapsKey = "mindmap:recent-maps";

export function getClientId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(userIdKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(userIdKey, next);
  return next;
}

export function getUserName() {
  if (typeof window === "undefined") return "ゲスト";
  const existing = window.localStorage.getItem(userNameKey);
  if (existing) return existing;
  const next = `ゲスト${Math.floor(Math.random() * 900 + 100)}`;
  window.localStorage.setItem(userNameKey, next);
  return next;
}

export function setUserName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(userNameKey, name.trim() || "ゲスト");
}

export function getRecentMaps(): RecentMap[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentMapsKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentMap(map: RecentMap) {
  if (typeof window === "undefined") return;
  const maps = getRecentMaps().filter((item) => item.roomId !== map.roomId);
  maps.unshift({ ...map, lastOpenedAt: Date.now() });
  window.localStorage.setItem(recentMapsKey, JSON.stringify(maps.slice(0, 24)));
}

export function saveCreatedLinks(links: ShareLinks & { title: string }) {
  saveRecentMap({
    roomId: links.roomId,
    title: links.title,
    editUrl: links.editUrl,
    viewUrl: links.viewUrl,
    lastOpenedAt: Date.now(),
  });
}

export function pendingImportKey(roomId: string) {
  return `mindmap:pending-import:${roomId}`;
}
