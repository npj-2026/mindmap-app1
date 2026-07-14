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

type DeleteMapBody = {
  ownerToken?: string;
  adminToken?: string;
};

function liveblocksStatus(error: unknown) {
  const candidate = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  return candidate.status ?? candidate.statusCode ?? candidate.response?.status;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function DELETE(request: Request, context: RouteContext) {
  const { roomId } = await context.params;

  if (!isMindMapRoom(roomId)) {
    return NextResponse.json(
      { error: "not_found", message: "このマップは削除されています。" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: DeleteMapBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as DeleteMapBody;
  } catch {
    body = {};
  }

  try {
    const liveblocks = getLiveblocks();
    let room;

    try {
      room = await liveblocks.getRoom(roomId);
    } catch (error) {
      if (liveblocksStatus(error) === 404) {
        return NextResponse.json(
          { error: "not_found", message: "このマップは削除されています。" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw error;
    }

    const metadata = (room.metadata ?? {}) as MindMapRoomMetadata;
    const ownerToken = stringValue(body.ownerToken);
    const adminToken = stringValue(body.adminToken);
    const isOwner = isOwnerToken(metadata, ownerToken);
    const isAdmin = isAdminToken(adminToken);

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "forbidden", message: "このマップを削除する権限がありません。" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      await liveblocks.deleteRoom(roomId);
    } catch (error) {
      console.error("Failed to delete Liveblocks room", { roomId, error });
      return NextResponse.json(
        { error: "delete_failed", message: "Liveblocksのルーム削除に失敗しました。" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, roomId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to delete mind map", { roomId, error });
    return NextResponse.json(
      { error: "delete_failed", message: "マップの削除に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
