import { jsonError } from "../../../../../../src/print-shops/http";
import { adminSnapshot } from "../../../../../../src/print-shops/server-auth";
import { getPrintShopBucket } from "../../../../../../src/print-shops/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const snapshot = await adminSnapshot(request); if (!snapshot) return new Response("Authentication required.", { status: 401 });
    const { id } = await params, template = snapshot.data.templates.find(item => item.id === id);
    if (!template) return new Response("Not found", { status: 404 });
    const object = await getPrintShopBucket().get(template.previewKey); if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ETag: object.httpEtag } });
  } catch (error) { return jsonError(error); }
}
