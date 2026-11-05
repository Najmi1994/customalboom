
import { createSessionToken, verifySessionToken } from "./crypto";
import { ensureStyleStore, type StoreSnapshot } from "./store";

export const ADMIN_COOKIE = "customalboom_kingkong";
export const SESSION_SECONDS = 12 * 60 * 60;

function cookieValue(
  request: Request,
  name: string
): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function publicOrigin(request: Request): string {
  const configuredOrigin =
    process.env.CUSTOMALBOOM_PUBLIC_ORIGIN;

  if (configuredOrigin) {
    return new URL(configuredOrigin).origin;
  }

  return new URL(request.url).origin;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  return Boolean(
    origin &&
    origin === publicOrigin(request) &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

export async function adminSnapshot(
  request: Request
): Promise<StoreSnapshot | null> {
  const snapshot = await ensureStyleStore();
  const token = cookieValue(request, ADMIN_COOKIE);

  if (
    !token ||
    !(await verifySessionToken(
      token,
      snapshot.data.auth.username,
      snapshot.data.auth.password.hash
    ))
  ) {
    return null;
  }

  return snapshot;
}

export async function newAdminSession(
  snapshot: StoreSnapshot
): Promise<string> {
  return createSessionToken(
    snapshot.data.auth.username,
    snapshot.data.auth.password.hash,
    Date.now() + SESSION_SECONDS * 1000
  );
}

export function sessionCookie(
  request: Request,
  token: string
): string {
  const secure =
    new URL(publicOrigin(request)).protocol === "https:"
      ? "; Secure"
      : "";

  return `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(
  request: Request
): string {
  const secure =
    new URL(publicOrigin(request)).protocol === "https:"
      ? "; Secure"
      : "";

  return `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}
