import { getPrintShopBucket, readStyleStore } from '../../../../../src/print-shops/store';
import { jsonError } from '../../../../../src/print-shops/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const snapshot = await readStyleStore(), portrait = snapshot?.data.supportSettings.portrait;
    if (!portrait || portrait.id !== id) return new Response('Not found', { status: 404 });
    const object = await getPrintShopBucket().get(`support-photos/${portrait.id}.${portrait.extension}`);
    if (!object) return new Response('Not found', { status: 404 });
    return new Response(object.body, { headers: { 'Content-Type': portrait.extension === 'jpg' ? 'image/jpeg' : `image/${portrait.extension}`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return jsonError(error); }
}
