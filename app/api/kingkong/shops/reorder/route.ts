import { z } from "zod";
import { orderedShops, toAdminShop } from "../../../../../src/print-shops/domain";
import { jsonError, noStoreJson, validationError } from "../../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../../src/print-shops/server-auth";
import { StoreConflictError, nextStore, writeStyleStore } from "../../../../../src/print-shops/store";

const reorderSchema = z.object({ revision: z.number().int().min(0), orderedIds: z.array(z.string().min(1)) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = reorderSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const expected = new Set(snapshot.data.shops.map(shop => shop.id));
    const received = new Set(parsed.data.orderedIds);
    if (expected.size !== received.size || parsed.data.orderedIds.length !== received.size || [...expected].some(id => !received.has(id))) {
      return noStoreJson({ error: "The reorder list does not match the current shops." }, { status: 400 });
    }
    const byId = new Map(snapshot.data.shops.map(shop => [shop.id, shop]));
    const shops = parsed.data.orderedIds.map((id, index) => ({ ...byId.get(id)!, displayOrder: index, updatedAt: new Date().toISOString() }));
    const saved = await writeStyleStore(snapshot, nextStore(snapshot, shops));
    return noStoreJson({ revision: saved.data.revision, shops: orderedShops(saved.data.shops).map(toAdminShop) });
  } catch (error) {
    return jsonError(error);
  }
}
