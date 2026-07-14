import crypto from "node:crypto";
import { Liveblocks } from "@liveblocks/node";
import type { AccessMode } from "@/types/mindmap";

export const roomPrefix = "mindmap";

export type MindMapRoomMetadata = {
  kind?: string;
  title?: string;
  ownerTokenHash?: string;
  ownerTokenCipher?: string;
  editTokenHash?: string;
  viewTokenHash?: string;
  editTokenCipher?: string;
  viewTokenCipher?: string;
  createdAt?: string;
};

let liveblocksClient: Liveblocks | null = null;

export function getLiveblocks() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    throw new Error("LIVEBLOCKS_SECRET_KEY is not set");
  }

  if (!liveblocksClient) {
    liveblocksClient = new Liveblocks({ secret });
  }
  return liveblocksClient;
}

export function makeRoomId() {
  return `${roomPrefix}-${crypto.randomUUID()}`;
}

export function makeShareToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function encryptionKey() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY ?? "";
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(cipherText?: string) {
  if (!cipherText) return null;
  const [ivPart, tagPart, encryptedPart] = cipherText.split(".");
  if (!ivPart || !tagPart || !encryptedPart) return null;

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function mapUrl(roomId: string, mode: AccessMode, token: string) {
  const params = new URLSearchParams({ mode, token });
  return `${appUrl()}/map/${encodeURIComponent(roomId)}?${params.toString()}`;
}

export function accessForToken(metadata: MindMapRoomMetadata, token: string): AccessMode | null {
  const hashed = hashToken(token);
  if (metadata.editTokenHash && hashed === metadata.editTokenHash) {
    return "edit";
  }
  if (metadata.viewTokenHash && hashed === metadata.viewTokenHash) {
    return "view";
  }
  return null;
}

export function isOwnerToken(metadata: MindMapRoomMetadata, token: string) {
  return Boolean(token && metadata.ownerTokenHash && hashToken(token) === metadata.ownerTokenHash);
}

export function isAdminToken(token: string) {
  const configured = process.env.MINDMAP_ADMIN_TOKEN;
  return Boolean(token && configured && hashToken(token) === hashToken(configured));
}

export function isMindMapRoom(roomId: string) {
  return roomId.startsWith(`${roomPrefix}-`);
}
