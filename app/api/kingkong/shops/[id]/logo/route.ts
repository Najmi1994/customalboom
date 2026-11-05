import { z } from "zod";
import { orderedShops, toAdminShop } from "../../../../../../src/print-shops/domain";
import { jsonError, noStoreJson } from "../../../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../../../src/print-shops/server-auth";
import { LOGO_PREFIX, StoreConflictError, getPrintShopBucket, nextStore, writeStyleStore } from "../../../../../../src/print-shops/store";

const MAX_LOGO_BYTES = 1024 * 1024;
const revisionSchema = z.coerce.number().int().min(0);

function detectLogo(bytes: Uint8Array): { contentType: "image/png" | "image/jpeg" | "image/webp"; extension: string } | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return { contentType: "image/png", extension: "png" };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { contentType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return { contentType: "image/webp", extension: "webp" };
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return new Response("Authentication required.", { status: 401 });
    const { id } = await params;
    const logo = snapshot.data.shops.find(shop => shop.id === id)?.logo;
    if (!logo) return new Response("Not found", { status: 404 });
    const object = await getPrintShopBucket().get(logo.key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", logo.contentType);
    headers.set("Cache-Control", "private, no-store");
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  let uploadedKey: string | undefined;
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const { id } = await params;
    const shop = snapshot.data.shops.find(item => item.id === id);
    if (!shop) return noStoreJson({ error: "Shop not found." }, { status: 404 });
    const form = await request.formData();
    const parsedRevision = revisionSchema.safeParse(form.get("revision"));
    if (!parsedRevision.success) return noStoreJson({ error: "Invalid revision." }, { status: 400 });
    if (parsedRevision.data !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const value = form.get("logo");
    if (!(value instanceof File) || !value.size || value.size > MAX_LOGO_BYTES) return noStoreJson({ error: "Logo mesti PNG, JPEG atau WebP dan tidak melebihi 1 MB." }, { status: 400 });
    const bytes = new Uint8Array(await value.arrayBuffer());
    const detected = detectLogo(bytes);
    if (!detected) return noStoreJson({ error: "Logo mesti fail PNG, JPEG atau WebP yang sah." }, { status: 400 });
    uploadedKey = `${LOGO_PREFIX}${id}/${crypto.randomUUID()}.${detected.extension}`;
    await getPrintShopBucket().put(uploadedKey, bytes, { httpMetadata: { contentType: detected.contentType, cacheControl: "public, max-age=86400" } });
    const updatedAt = new Date().toISOString();
    const shops = snapshot.data.shops.map(item => item.id === id ? { ...item, logo: { key: uploadedKey!, contentType: detected.contentType, updatedAt }, updatedAt } : item);
    const saved = await writeStyleStore(snapshot, nextStore(snapshot, shops));
    if (shop.logo) await getPrintShopBucket().delete(shop.logo.key).catch(() => {});
    return noStoreJson({ revision: saved.data.revision, shops: orderedShops(saved.data.shops).map(toAdminShop) });
  } catch (error) {
    if (uploadedKey) await getPrintShopBucket().delete(uploadedKey).catch(() => {});
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const payload = await request.json() as { revision?: unknown };
    const parsedRevision = revisionSchema.safeParse(payload.revision);
    if (!parsedRevision.success) return noStoreJson({ error: "Invalid revision." }, { status: 400 });
    if (parsedRevision.data !== snapshot.data.revision) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
    const { id } = await params;
    const shop = snapshot.data.shops.find(item => item.id === id);
    if (!shop) return noStoreJson({ error: "Shop not found." }, { status: 404 });
    if (!shop.logo) return noStoreJson({ revision: snapshot.data.revision, shops: orderedShops(snapshot.data.shops).map(toAdminShop) });
    const shops = snapshot.data.shops.map(item => item.id === id ? { ...item, logo: undefined, updatedAt: new Date().toISOString() } : item);
    const saved = await writeStyleStore(snapshot, nextStore(snapshot, shops));
    await getPrintShopBucket().delete(shop.logo.key).catch(() => {});
    return noStoreJson({ revision: saved.data.revision, shops: orderedShops(saved.data.shops).map(toAdminShop) });
  } catch (error) {
    return jsonError(error);
  }
}
