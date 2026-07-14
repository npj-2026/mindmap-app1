import { NextResponse } from "next/server";
import {
  getLiveblocks,
  isAdminToken,
  isMindMapRoom,
  isOwnerToken,
  type MindMapRoomMetadata,
} from "@/lib/server/liveblocks";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { roomId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    ownerToken?: string;
    adminToken?: string;
  };

  if (!isMindMapRoom(roomId)) {
    return NextResponse.json(
      { allowed: false, error: "not_found", message: "このマップは削除されています。" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const liveblocks = getLiveblocks();
    const room = await liveblocks.getRoom(roomId);
    const metadata = (room.metadata ?? {}) as MindMapRoomMetadata;
    const ownerToken = typeof body.ownerToken === "string" ? body.ownerToken : "";
    const adminToken = typeof body.adminToken === "string" ? body.adminToken : "";
    const allowed = isOwnerToken(metadata, ownerToken) || isAdminToken(adminToken);

    if (!allowed) {
      return NextResponse.json(
        { allowed: false, error: "forbidden", message: "履歴を復元する権限がありません。" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to verify version restore access", { roomId, error });
    return NextResponse.json(
      { allowed: false, error: "verify_failed", message: "復元権限の確認に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
