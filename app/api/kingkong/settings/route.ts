import { z } from "zod";
import { normalizePhone, supportSettingsSchema, type SupportSettings } from "../../../../src/print-shops/domain";
import { jsonError, noStoreJson, validationError } from "../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../src/print-shops/server-auth";
import { StoreConflictError, writeStyleStore } from "../../../../src/print-shops/store";

const settingsSchema = z.object({
  revision: z.number().int().min(0),
  adminContactPhone: z.string().trim().max(40).optional().default("").refine(value => !value || Boolean(normalizePhone(value)), "Masukkan nombor WhatsApp admin yang sah."),
  supportSettings: supportSettingsSchema.optional(),
});

function payload(revision: number, supportSettings: SupportSettings, adminContactPhone?: string) {
  return { revision, adminContactPhone: adminContactPhone ?? "", supportSettings };
}

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    return noStoreJson(payload(snapshot.data.revision, snapshot.data.supportSettings, snapshot.data.adminContactPhone));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const value = parsed.data.adminContactPhone || undefined;
    const saved = await writeStyleStore(snapshot, {
      ...snapshot.data,
      revision: snapshot.data.revision + 1,
      adminContactPhone: value,
      supportSettings: parsed.data.supportSettings ?? snapshot.data.supportSettings,
    });
    return noStoreJson(payload(saved.data.revision, saved.data.supportSettings, saved.data.adminContactPhone));
  } catch (error) {
    return jsonError(error);
  }
}
