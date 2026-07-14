import { NextResponse } from "next/server";
import { pickColor } from "@/lib/colors";
import {
  accessForToken,
  getLiveblocks,
  isMindMapRoom,
  type MindMapRoomMetadata,
} from "@/lib/server/liveblocks";

export const runtime = "nodejs";

type AuthBody = {
  room?: string;
  token?: string;
  userId?: string;
  name?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AuthBody;
    const roomId = typeof body.room === "string" ? body.room : "";
    const token = typeof body.token === "string" ? body.token : "";

    if (!roomId || !token || !isMindMapRoom(roomId)) {
      return NextResponse.json(
        { error: "forbidden", reason: "共有リンクが正しくありません。" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const liveblocks = getLiveblocks();
    const room = await liveblocks.getRoom(roomId);
    const metadata = (room.metadata ?? {}) as MindMapRoomMetadata;
    const access = accessForToken(metadata, token);

    if (!access) {
      return NextResponse.json(
        { error: "forbidden", reason: "この共有リンクは無効です。" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const userId =
      typeof body.userId === "string" && body.userId
        ? body.userId.slice(0, 80)
        : crypto.randomUUID();
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 32)
        : "ゲスト";
    const color = pickColor(userId);
    const session = liveblocks.prepareSession(userId, {
      userInfo: { name, color },
    });

    session.allow(roomId, [access === "edit" ? "*:write" : "*:read"]);
    const { body: responseBody, status } = await session.authorize();

    return new Response(responseBody, {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: "auth_failed", message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
