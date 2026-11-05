import { z } from "zod";
import { verifyPassword } from "../../../../src/print-shops/crypto";
import { jsonError, noStoreJson, validationError } from "../../../../src/print-shops/http";
import { adminSnapshot, clearSessionCookie, isSameOrigin, newAdminSession, sessionCookie } from "../../../../src/print-shops/server-auth";
import { ensureStyleStore } from "../../../../src/print-shops/store";

const credentialsSchema = z.object({ username: z.string().trim().min(1).max(120), password: z.string().min(1).max(512) });

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request);
    return noStoreJson({ authenticated: Boolean(snapshot), ...(snapshot ? { username: snapshot.data.auth.username } : {}) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const started = Date.now();
  try {
    const parsed = credentialsSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const snapshot = await ensureStyleStore();
    const validPassword = await verifyPassword(parsed.data.password, snapshot.data.auth.password);
    const valid = parsed.data.username === snapshot.data.auth.username && validPassword;
    const remaining = 450 - (Date.now() - started);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    if (!valid) return noStoreJson({ error: "Username atau password tidak sah." }, { status: 401 });
    const token = await newAdminSession(snapshot);
    const response = noStoreJson({ authenticated: true, username: snapshot.data.auth.username });
    response.headers.set("Set-Cookie", sessionCookie(request, token));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const response = noStoreJson({ authenticated: false });
  response.headers.set("Set-Cookie", clearSessionCookie(request));
  return response;
}
