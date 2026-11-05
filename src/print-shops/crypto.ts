import type { PasswordDigest } from "./domain";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 160_000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index++) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<PasswordDigest> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, iterations);
  return { algorithm: "PBKDF2-SHA-256", iterations, salt: bytesToBase64Url(salt), hash: bytesToBase64Url(hash) };
}

export async function verifyPassword(password: string, digest: PasswordDigest): Promise<boolean> {
  const actual = await derivePassword(password, base64UrlToBytes(digest.salt), digest.iterations);
  return safeEqual(actual, base64UrlToBytes(digest.hash));
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(username: string, secret: string, expiresAt: number): Promise<string> {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ username, expiresAt })));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(token: string, username: string, secret: string, now = Date.now()): Promise<boolean> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = await sign(payload, secret);
  if (!safeEqual(base64UrlToBytes(signature), base64UrlToBytes(expected))) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { username?: unknown; expiresAt?: unknown };
    return parsed.username === username && typeof parsed.expiresAt === "number" && parsed.expiresAt > now;
  } catch {
    return false;
  }
}
