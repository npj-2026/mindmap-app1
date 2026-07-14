import { NextResponse } from "next/server";
import { isAdminToken } from "@/lib/server/liveblocks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { adminToken?: unknown };
  const adminToken = typeof body.adminToken === "string" ? body.adminToken.trim() : "";

  if (!isAdminToken(adminToken)) {
    return NextResponse.json(
      { ok: false, message: "管理者トークンが正しくありません" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
