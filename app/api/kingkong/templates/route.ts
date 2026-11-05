import { z } from "zod";
import { templateMetadataInputSchema, TEMPLATE_PREFIX, type ManagedTemplate } from "../../../../src/templates/domain";
import { adminCatalogPayload, isPng, parseTemplateBytes, templateStats } from "../../../../src/templates/server";
import { jsonError, noStoreJson } from "../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../src/print-shops/server-auth";
import { StoreConflictError, getPrintShopBucket, nextStorePatch, writeStyleStore } from "../../../../src/print-shops/store";

const revisionSchema = z.coerce.number().int().min(0);
const MAX_PREVIEW_BYTES = 2_000_000;

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    return noStoreJson(adminCatalogPayload(snapshot));
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const uploaded: string[] = [];
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const form = await request.formData(), revision = revisionSchema.safeParse(form.get("revision"));
    if (!revision.success) return noStoreJson({ error: "Revision tidak sah." }, { status: 400 });
    if (revision.data !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    const metadata = templateMetadataInputSchema.safeParse({ title: form.get("title"), categoryId: form.get("categoryId"), status: form.get("status") });
    if (!metadata.success) return noStoreJson({ error: metadata.error.issues[0]?.message ?? "Maklumat template tidak sah." }, { status: 400 });
    if (!snapshot.data.templateCategories.some(item => item.id === metadata.data.categoryId)) return noStoreJson({ error: "Kategori tidak ditemui." }, { status: 400 });
    const file = form.get("template"), preview = form.get("preview");
    if (!(file instanceof File) || !/\.(lca|album-template\.json)$/i.test(file.name)) return noStoreJson({ error: "Pilih fail .lca atau .album-template.json." }, { status: 400 });
    if (!(preview instanceof File) || !preview.size || preview.size > MAX_PREVIEW_BYTES) return noStoreJson({ error: "Preview PNG tidak sah atau melebihi 2 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer()), previewBytes = new Uint8Array(await preview.arrayBuffer());
    let parsed; try { parsed = parseTemplateBytes(bytes); } catch (error) { return noStoreJson({ error: error instanceof Error ? error.message : "Format template tidak sah." }, { status: 400 }); }
    if (!isPng(previewBytes)) return noStoreJson({ error: "Preview mesti fail PNG yang sah." }, { status: 400 });
    const id = crypto.randomUUID(), version = crypto.randomUUID(), objectKey = `${TEMPLATE_PREFIX}${id}/${version}.lca`, previewKey = `${TEMPLATE_PREFIX}${id}/${version}.png`;
    await getPrintShopBucket().put(objectKey, bytes, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" } }); uploaded.push(objectKey);
    await getPrintShopBucket().put(previewKey, previewBytes, { httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=86400" } }); uploaded.push(previewKey);
    const now = new Date().toISOString(), stats = templateStats(parsed);
    const record: ManagedTemplate = { id, ...metadata.data, ...stats, displayOrder: snapshot.data.templates.filter(item => item.categoryId === metadata.data.categoryId).length, objectKey, previewKey, createdAt: now, updatedAt: now };
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templates: [...snapshot.data.templates, record] }));
    return noStoreJson(adminCatalogPayload(saved), { status: 201 });
  } catch (error) {
    if (uploaded.length) await Promise.all(uploaded.map(key => getPrintShopBucket().delete(key).catch(() => {})));
    return jsonError(error);
  }
}
