import { jsonError, noStoreJson } from "../../../../src/print-shops/http";
import { getPrintShopBucket, readStyleStore } from "../../../../src/print-shops/store";
import { parseTemplateBytes } from "../../../../src/templates/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const snapshot = await readStyleStore(), { id } = await params;
    const record = snapshot?.data.templates.find(item => item.id === id && item.status === "published");
    if (!record) return noStoreJson({ error: "Template tidak ditemui." }, { status: 404 });
    const object = await getPrintShopBucket().get(record.objectKey); if (!object) return noStoreJson({ error: "Fail template tidak ditemui." }, { status: 404 });
    const parsed = parseTemplateBytes(new Uint8Array(await object.arrayBuffer()));
    const template = parsed.kind === "album-template" ? { ...parsed, name: record.title } : { ...parsed, name: record.title };
    const response = Response.json({ template }); response.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300"); return response;
  } catch (error) { return jsonError(error); }
}
