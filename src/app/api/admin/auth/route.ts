import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  buildSessionCookie,
  buildClearCookie,
  verifyAdminRequest,
  checkAdminPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const password = (body as { password?: unknown })?.password;
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }

  let ok = false;
  try {
    ok = checkAdminPassword(password);
  } catch (e) {
    console.error("[admin/auth] config error:", (e as Error).message);
    return NextResponse.json({ error: "server_misconfig" }, { status: 500 });
  }

  await new Promise(r => setTimeout(r, 200));

  if (!ok) {
    return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }

  const token = createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildSessionCookie(token));
  return res;
}

export async function GET(req: NextRequest) {
  const ok = verifyAdminRequest(req);
  return NextResponse.json({ authed: ok }, { status: ok ? 200 : 401 });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildClearCookie());
  return res;
}
