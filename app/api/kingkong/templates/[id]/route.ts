import { z } from "zod";
import { TEMPLATE_PREFIX, templateMetadataInputSchema, type ManagedTemplate } from "../../../../../src/templates/domain";
import { adminCatalogPayload, isPng, normalizedOrders, parseTemplateBytes, templateStats } from "../../../../../src/templates/server";
import { jsonError, noStoreJson } from "../../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../../src/print-shops/server-auth";
import { StoreConflictError, getPrintShopBucket, nextStorePatch, writeStyleStore } from "../../../../../src/print-shops/store";

const revisionSchema = z.coerce.number().int().min(0), MAX_PREVIEW_BYTES = 2_000_000;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const uploaded: string[] = [];
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const { id } = await params, existing = snapshot.data.templates.find(item => item.id === id);
    if (!existing) return noStoreJson({ error: "Template tidak ditemui." }, { status: 404 });
    const form = await request.formData(), revision = revisionSchema.safeParse(form.get("revision"));
    if (!revision.success) return noStoreJson({ error: "Revision tidak sah." }, { status: 400 });
    if (revision.data !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    const metadata = templateMetadataInputSchema.safeParse({ title: form.get("title"), categoryId: form.get("categoryId"), status: form.get("status") });
    if (!metadata.success) return noStoreJson({ error: metadata.error.issues[0]?.message ?? "Maklumat template tidak sah." }, { status: 400 });
    if (!snapshot.data.templateCategories.some(item => item.id === metadata.data.categoryId)) return noStoreJson({ error: "Kategori tidak ditemui." }, { status: 400 });
    const file = form.get("template"), preview = form.get("preview"), replacing = file instanceof File && file.size > 0;
    let replacement: Partial<ManagedTemplate> = {};
    if (replacing) {
      if (!/\.(lca|album-template\.json)$/i.test(file.name) || !(preview instanceof File) || !preview.size || preview.size > MAX_PREVIEW_BYTES) return noStoreJson({ error: "Fail template dan preview PNG tidak sah." }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer()), previewBytes = new Uint8Array(await preview.arrayBuffer());
      let parsed; try { parsed = parseTemplateBytes(bytes); } catch (error) { return noStoreJson({ error: error instanceof Error ? error.message : "Format template tidak sah." }, { status: 400 }); }
      if (!isPng(previewBytes)) return noStoreJson({ error: "Preview mesti fail PNG yang sah." }, { status: 400 });
      const version = crypto.randomUUID(), objectKey = `${TEMPLATE_PREFIX}${id}/${version}.lca`, previewKey = `${TEMPLATE_PREFIX}${id}/${version}.png`;
      await getPrintShopBucket().put(objectKey, bytes, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" } }); uploaded.push(objectKey);
      await getPrintShopBucket().put(previewKey, previewBytes, { httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=86400" } }); uploaded.push(previewKey);
      replacement = { ...templateStats(parsed), objectKey, previewKey };
    }
    const moved = metadata.data.categoryId !== existing.categoryId, now = new Date().toISOString();
    let templates = snapshot.data.templates.map(item => item.id === id ? { ...item, ...metadata.data, ...replacement, displayOrder: moved ? snapshot.data.templates.filter(other => other.categoryId === metadata.data.categoryId).length : item.displayOrder, updatedAt: now } : item);
    const oldCategory = templates.filter(item => item.categoryId === existing.categoryId && item.id !== id).sort((a, b) => a.displayOrder - b.displayOrder);
    if (moved) {
      const normalized = normalizedOrders(oldCategory, now), byId = new Map(normalized.map(item => [item.id, item]));
      templates = templates.map(item => byId.get(item.id) ?? item);
    }
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templates }));
    if (replacing) await Promise.all([existing.objectKey, existing.previewKey].map(key => getPrintShopBucket().delete(key).catch(() => {})));
    return noStoreJson(adminCatalogPayload(saved));
  } catch (error) {
    if (uploaded.length) await Promise.all(uploaded.map(key => getPrintShopBucket().delete(key).catch(() => {})));
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { revision?: unknown }, revision = revisionSchema.safeParse(body.revision);
    if (!revision.success) return noStoreJson({ error: "Revision tidak sah." }, { status: 400 });
    if (revision.data !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    const { id } = await params, existing = snapshot.data.templates.find(item => item.id === id);
    if (!existing) return noStoreJson({ error: "Template tidak ditemui." }, { status: 404 });
    const remaining = snapshot.data.templates.filter(item => item.id !== id), category = normalizedOrders(remaining.filter(item => item.categoryId === existing.categoryId).sort((a, b) => a.displayOrder - b.displayOrder));
    const byId = new Map(category.map(item => [item.id, item])), templates = remaining.map(item => byId.get(item.id) ?? item);
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templates }));
    await Promise.all([existing.objectKey, existing.previewKey].map(key => getPrintShopBucket().delete(key).catch(() => {})));
    return noStoreJson(adminCatalogPayload(saved));
  } catch (error) { return jsonError(error); }
}
