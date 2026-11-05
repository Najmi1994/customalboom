import { z } from "zod";
import { categoryInputSchema, type TemplateCategory } from "../../../../src/templates/domain";
import { adminCatalogPayload } from "../../../../src/templates/server";
import { jsonError, noStoreJson, validationError } from "../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../src/print-shops/server-auth";
import { StoreConflictError, nextStorePatch, writeStyleStore } from "../../../../src/print-shops/store";

const createSchema = z.object({ revision: z.number().int().min(0), category: categoryInputSchema }).strict();

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    return noStoreJson(adminCatalogPayload(snapshot));
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Authentication required." }, { status: 401 });
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError("Katalog berubah dalam tab lain. Muat semula dan cuba lagi.");
    if (snapshot.data.templateCategories.some(item => item.name.toLocaleLowerCase() === parsed.data.category.name.toLocaleLowerCase())) return noStoreJson({ error: "Kategori dengan nama ini sudah wujud." }, { status: 400 });
    const now = new Date().toISOString();
    const category: TemplateCategory = { id: crypto.randomUUID(), name: parsed.data.category.name, displayOrder: snapshot.data.templateCategories.length, createdAt: now, updatedAt: now };
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { templateCategories: [...snapshot.data.templateCategories, category] }));
    return noStoreJson(adminCatalogPayload(saved), { status: 201 });
  } catch (error) { return jsonError(error); }
}
