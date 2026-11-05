import { z } from "zod";
import { adminCatalogPayload } from "../../../../../src/templates/server";
import { jsonError, noStoreJson, validationError } from "../../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../../src/print-shops/server-auth";
import { StoreConflictError, nextStorePatch, writeStyleStore } from "../../../../../src/print-shops/store";
const schema = z.object({ revision: z.number().int().min(0), categoryId: z.string().min(1), orderedIds: z.array(z.string().min(1)) }).strict();
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = schema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    const expected = new Set(snapshot.data.templates.filter(item => item.categoryId === parsed.data.categoryId).map(item => item.id)), received = new Set(parsed.data.orderedIds);
    if (expected.size !== received.size || received.size !== parsed.data.orderedIds.length || [...expected].some(id => !received.has(id))) return noStoreJson({ error: "Senarai susunan template tidak sepadan." }, { status: 400 });
    const order = new Map(parsed.data.orderedIds.map((id, index) => [id, index])), now = new Date().toISOString();
    const templates = snapshot.data.templates.map(item => item.categoryId === parsed.data.categoryId ? { ...item, displayOrder: order.get(item.id)!, updatedAt: now } : item);
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templates }));
    return noStoreJson(adminCatalogPayload(saved));
  } catch (error) { return jsonError(error); }
}
