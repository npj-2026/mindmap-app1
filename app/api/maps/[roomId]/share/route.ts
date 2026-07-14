import { NextResponse } from "next/server";
import {
  accessForToken,
  decryptToken,
  getLiveblocks,
  isMindMapRoom,
  mapUrl,
  type MindMapRoomMetadata,
} from "@/lib/server/liveblocks";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { roomId } = await context.params;
    const { token } = (await request.json().catch(() => ({}))) as { token?: string };

    if (!isMindMapRoom(roomId) || typeof token !== "string") {
      return NextResponse.json(
        { error: "bad_request" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const liveblocks = getLiveblocks();
    const room = await liveblocks.getRoom(roomId);
    const metadata = (room.metadata ?? {}) as MindMapRoomMetadata;
    const access = accessForToken(metadata, token);

    if (!access) {
      return NextResponse.json(
        { error: "forbidden", reason: "共有リンクが無効です。" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const viewToken = decryptToken(metadata.viewTokenCipher);
    const editToken = access === "edit" ? decryptToken(metadata.editTokenCipher) : null;

    if (!viewToken || (access === "edit" && !editToken)) {
      return NextResponse.json(
        { error: "token_restore_failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        roomId,
        editUrl: editToken ? mapUrl(roomId, "edit", editToken) : undefined,
        viewUrl: mapUrl(roomId, "view", viewToken),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: "share_failed", message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
