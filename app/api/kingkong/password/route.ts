import { hashPassword, verifyPassword } from "../../../../src/print-shops/crypto";
import { passwordChangeSchema } from "../../../../src/print-shops/domain";
import { jsonError, noStoreJson, validationError } from "../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin, newAdminSession, sessionCookie } from "../../../../src/print-shops/server-auth";
import { writeStyleStore } from "../../../../src/print-shops/store";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Sesi admin telah tamat." }, { status: 401 });
    const parsed = passwordChangeSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (!await verifyPassword(parsed.data.currentPassword, snapshot.data.auth.password)) {
      return noStoreJson({ error: "Password semasa tidak betul." }, { status: 400 });
    }
    const next = {
      ...snapshot.data,
      revision: snapshot.data.revision + 1,
      auth: { ...snapshot.data.auth, password: await hashPassword(parsed.data.newPassword) },
    };
    const saved = await writeStyleStore(snapshot, next);
    const response = noStoreJson({ changed: true });
    response.headers.set("Set-Cookie", sessionCookie(request, await newAdminSession(saved)));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
