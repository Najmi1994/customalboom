import { getPrintShopBucket, readStyleStore } from '../../../../src/print-shops/store';
import { jsonError } from '../../../../src/print-shops/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const snapshot = await readStyleStore();
    const banner = snapshot?.data.infoBanners.find(item => item.id === id);
    if (!banner) return new Response('Not found', { status: 404 });
    const object = await getPrintShopBucket().get(banner.key);
    if (!object) return new Response('Not found', { status: 404 });
    return new Response(object.body, { headers: { 'Content-Type': banner.contentType, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return jsonError(error); }
}
