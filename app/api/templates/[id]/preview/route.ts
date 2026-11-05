import { jsonError } from "../../../../../src/print-shops/http";
import { getPrintShopBucket, readStyleStore } from "../../../../../src/print-shops/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const snapshot = await readStyleStore(), { id } = await params;
    const template = snapshot?.data.templates.find(item => item.id === id && item.status === "published");
    if (!template) return new Response("Not found", { status: 404 });
    const object = await getPrintShopBucket().get(template.previewKey); if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", ETag: object.httpEtag } });
  } catch (error) { return jsonError(error); }
}
