import { NextResponse } from "next/server";
import {
  encryptToken,
  getLiveblocks,
  hashToken,
  makeRoomId,
  makeShareToken,
  mapUrl,
} from "@/lib/server/liveblocks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const title =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim().slice(0, 80)
        : "新しいマインドマップ";

    const roomId = makeRoomId();
    const editToken = makeShareToken();
    const viewToken = makeShareToken();
    const liveblocks = getLiveblocks();

    await liveblocks.createRoom(roomId, {
      defaultAccesses: [],
      metadata: {
        kind: "mindmap",
        title,
        editTokenHash: hashToken(editToken),
        viewTokenHash: hashToken(viewToken),
        editTokenCipher: encryptToken(editToken),
        viewTokenCipher: encryptToken(viewToken),
        createdAt: new Date().toISOString(),
      },
    });

    return NextResponse.json(
      {
        roomId,
        title,
        editToken,
        viewToken,
        editUrl: mapUrl(roomId, "edit", editToken),
        viewUrl: mapUrl(roomId, "view", viewToken),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: "create_room_failed", message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
