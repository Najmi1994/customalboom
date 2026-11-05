import { z } from "zod";
import { orderedShops, shopInputSchema, toAdminShop, type PrintShop } from "../../../../src/print-shops/domain";
import { jsonError, noStoreJson, validationError } from "../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../src/print-shops/server-auth";
import { StoreConflictError, nextStore, writeStyleStore } from "../../../../src/print-shops/store";

const createSchema = z.object({ revision: z.number().int().min(0), shop: shopInputSchema });

function payload(revision: number, shops: PrintShop[]) {
  return { revision, shops: orderedShops(shops).map(toAdminShop) };
}

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    return noStoreJson(payload(snapshot.data.revision, snapshot.data.shops));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const now = new Date().toISOString();
    const shop: PrintShop = {
      ...parsed.data.shop,
      id: crypto.randomUUID(),
      displayOrder: Math.max(-1, ...snapshot.data.shops.map(item => item.displayOrder)) + 1,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await writeStyleStore(snapshot, nextStore(snapshot, [...snapshot.data.shops, shop]));
    return noStoreJson({ ...payload(saved.data.revision, saved.data.shops), shop: toAdminShop(shop) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
