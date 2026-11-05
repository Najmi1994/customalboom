import { z } from "zod";
import { orderedShops, shopInputSchema, toAdminShop, type PrintShop } from "../../../../../src/print-shops/domain";
import { jsonError, noStoreJson, validationError } from "../../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../../src/print-shops/server-auth";
import { StoreConflictError, getPrintShopBucket, nextStore, writeStyleStore } from "../../../../../src/print-shops/store";

const updateSchema = z.object({ revision: z.number().int().min(0), shop: shopInputSchema });
const revisionSchema = z.object({ revision: z.number().int().min(0) });

function payload(revision: number, shops: PrintShop[]) {
  return { revision, shops: orderedShops(shops).map(toAdminShop) };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const { id } = await params;
    const existing = snapshot.data.shops.find(shop => shop.id === id);
    if (!existing) return noStoreJson({ error: "Shop not found." }, { status: 404 });
    const updated: PrintShop = { ...existing, ...parsed.data.shop, updatedAt: new Date().toISOString() };
    const shops = snapshot.data.shops.map(shop => shop.id === id ? updated : shop);
    const saved = await writeStyleStore(snapshot, nextStore(snapshot, shops));
    return noStoreJson({ ...payload(saved.data.revision, saved.data.shops), shop: toAdminShop(updated) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = revisionSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const { id } = await params;
    const existing = snapshot.data.shops.find(shop => shop.id === id);
    if (!existing) return noStoreJson({ error: "Shop not found." }, { status: 404 });
    const remaining = orderedShops(snapshot.data.shops.filter(shop => shop.id !== id)).map((shop, index) => ({ ...shop, displayOrder: index }));
    const saved = await writeStyleStore(snapshot, nextStore(snapshot, remaining));
    if (existing.logo) await getPrintShopBucket().delete(existing.logo.key).catch(() => {});
    return noStoreJson(payload(saved.data.revision, saved.data.shops));
  } catch (error) {
    return jsonError(error);
  }
}
