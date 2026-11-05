import { malaysiaDate, shopStatus } from "../../../../../src/print-shops/domain";
import { readStyleStore, getPrintShopBucket } from "../../../../../src/print-shops/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await readStyleStore();
  const shop = snapshot?.data.shops.find(item => item.id === id);
  if (!shop?.logo || shopStatus(shop, malaysiaDate()) !== "active") return new Response("Not found", { status: 404 });
  const object = await getPrintShopBucket().get(shop.logo.key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", shop.logo.contentType);
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}
