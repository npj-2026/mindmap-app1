import type { RecentMap, ShareLinks } from "@/types/mindmap";

const userIdKey = "mindmap:user-id";
const userNameKey = "mindmap:user-name";
const recentMapsKey = "mindmap:recent-maps";
const adminTokenKey = "mindmap:admin-token";

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
  const existing = getRecentMaps().find((item) => item.roomId === map.roomId);
  const maps = getRecentMaps().filter((item) => item.roomId !== map.roomId);
  maps.unshift({
    ...existing,
    ...map,
    ownerToken: map.ownerToken ?? existing?.ownerToken,
    lastOpenedAt: Date.now(),
  });
  window.localStorage.setItem(recentMapsKey, JSON.stringify(maps.slice(0, 24)));
}

export function saveCreatedLinks(links: ShareLinks & { title: string }) {
  saveRecentMap({
    roomId: links.roomId,
    title: links.title,
    editUrl: links.editUrl,
    viewUrl: links.viewUrl,
    ownerToken: links.ownerToken,
    lastOpenedAt: Date.now(),
  });
}

export function removeRecentMap(roomId: string) {
  if (typeof window === "undefined") return;
  const maps = getRecentMaps().filter((item) => item.roomId !== roomId);
  window.localStorage.setItem(recentMapsKey, JSON.stringify(maps));
  window.localStorage.removeItem(pendingImportKey(roomId));
}

export function getAdminToken() {
  if (typeof window === "undefined") return "";
  window.localStorage.removeItem(adminTokenKey);
  return window.sessionStorage.getItem(adminTokenKey) ?? "";
}

export function setAdminToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(adminTokenKey);
  const trimmed = token.trim();
  if (trimmed) {
    window.sessionStorage.setItem(adminTokenKey, trimmed);
  } else {
    window.sessionStorage.removeItem(adminTokenKey);
  }
}

export function pendingImportKey(roomId: string) {
  return `mindmap:pending-import:${roomId}`;
}
