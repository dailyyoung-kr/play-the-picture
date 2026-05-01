import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET 미설정 또는 길이 부족(>=32 필요)");
  }
  return secret;
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string, secret: string): string {
  return base64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function createSessionToken(): string {
  const secret = getSecret();
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = base64urlEncode(Buffer.from(payload, "utf8"));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

function verifyToken(token: string): boolean {
  const secret = getSecret();
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;

  const expectedSig = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  try {
    const { exp } = JSON.parse(base64urlDecode(payloadB64).toString("utf8")) as { exp: number };
    if (typeof exp !== "number" || Date.now() > exp) return false;
  } catch {
    return false;
  }
  return true;
}

export function verifyAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyToken(token);
}

export function buildSessionCookie(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=0`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 8) {
    throw new Error("ADMIN_PASSWORD 미설정 또는 길이 부족(>=8 필요)");
  }
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
