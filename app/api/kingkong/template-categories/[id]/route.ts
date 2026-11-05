import { z } from "zod";
import { categoryInputSchema } from "../../../../../src/templates/domain";
import { adminCatalogPayload, normalizedOrders } from "../../../../../src/templates/server";
import { jsonError, noStoreJson, validationError } from "../../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../../src/print-shops/server-auth";
import { StoreConflictError, nextStorePatch, writeStyleStore } from "../../../../../src/print-shops/store";

const updateSchema = z.object({ revision: z.number().int().min(0), category: categoryInputSchema }).strict();
const revisionSchema = z.object({ revision: z.number().int().min(0) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = updateSchema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    const { id } = await params, existing = snapshot.data.templateCategories.find(item => item.id === id);
    if (!existing) return noStoreJson({ error: "Kategori tidak ditemui." }, { status: 404 });
    if (snapshot.data.templateCategories.some(item => item.id !== id && item.name.toLocaleLowerCase() === parsed.data.category.name.toLocaleLowerCase())) return noStoreJson({ error: "Kategori dengan nama ini sudah wujud." }, { status: 400 });
    const categories = snapshot.data.templateCategories.map(item => item.id === id ? { ...item, name: parsed.data.category.name, updatedAt: new Date().toISOString() } : item);
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templateCategories: categories }));
    return noStoreJson(adminCatalogPayload(saved));
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = revisionSchema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    const { id } = await params;
    if (!snapshot.data.templateCategories.some(item => item.id === id)) return noStoreJson({ error: "Kategori tidak ditemui." }, { status: 404 });
    if (snapshot.data.templates.some(template => template.categoryId === id)) return noStoreJson({ error: "Pindahkan atau padam semua template dalam kategori ini dahulu." }, { status: 409 });
    const categories = normalizedOrders(snapshot.data.templateCategories.filter(item => item.id !== id).sort((a, b) => a.displayOrder - b.displayOrder));
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templateCategories: categories }));
    return noStoreJson(adminCatalogPayload(saved));
  } catch (error) { return jsonError(error); }
}
