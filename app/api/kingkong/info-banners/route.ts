import { z } from 'zod';
import { bannerInputSchema, detectBanner, MAX_BANNER_BYTES, MAX_INFO_BANNERS, publicInfoBanners } from '../../../../src/info/domain';
import { adminSnapshot, isSameOrigin } from '../../../../src/print-shops/server-auth';
import { jsonError, noStoreJson, validationError } from '../../../../src/print-shops/http';
import { getPrintShopBucket, nextStorePatch, StoreConflictError, writeStyleStore } from '../../../../src/print-shops/store';

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: 'Sesi admin diperlukan.' }, { status: 401 });
    return noStoreJson({ revision: snapshot.data.revision, banners: publicInfoBanners(snapshot.data.infoBanners) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: 'Invalid request origin.' }, { status: 403 });
  let uploaded: string | undefined;
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: 'Sesi admin diperlukan.' }, { status: 401 });
    if (snapshot.data.infoBanners.length >= MAX_INFO_BANNERS) return noStoreJson({ error: 'Maksimum 5 banner.' }, { status: 400 });
    if (Number(request.headers.get('content-length')) > MAX_BANNER_BYTES + 16384) return noStoreJson({ error: 'Maksimum 3 MB setiap banner.' }, { status: 413 });
    const form = await request.formData();
    if (String(snapshot.data.revision) !== form.get('revision')) throw new StoreConflictError('Data berubah. Muat semula senarai dahulu.');
    const parsed = bannerInputSchema.safeParse({ title: form.get('title'), url: form.get('url') || '' });
    if (!parsed.success) return validationError(parsed.error);
    const file = form.get('image');
    if (!(file instanceof File) || !file.size || file.size > MAX_BANNER_BYTES) return noStoreJson({ error: 'Pilih PNG, JPEG atau WebP, maksimum 3 MB.' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer()), detected = detectBanner(bytes);
    if (!detected) return noStoreJson({ error: 'Format gambar tidak sah.' }, { status: 400 });
    const id = crypto.randomUUID();
    uploaded = `info-banners/${id}.${detected.extension}`;
    await getPrintShopBucket().put(uploaded, bytes);
    const banners = [...snapshot.data.infoBanners, { ...parsed.data, id, key: uploaded, contentType: detected.contentType }];
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { infoBanners: banners }));
    uploaded = undefined;
    return noStoreJson({ revision: saved.data.revision, banners: publicInfoBanners(banners) });
  } catch (error) {
    if (uploaded) await getPrintShopBucket().delete(uploaded).catch(() => {});
    return jsonError(error);
  }
}

const mutationSchema = z.object({ id: z.string().uuid(), revision: z.number().int().min(0), title: z.string().optional(), url: z.string().optional() }).strict();
async function mutate(request: Request, remove: boolean) {
  if (!isSameOrigin(request)) return noStoreJson({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: 'Sesi admin diperlukan.' }, { status: 401 });
    const parsed = mutationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (parsed.data.revision !== snapshot.data.revision) throw new StoreConflictError('Data berubah. Muat semula senarai dahulu.');
    const banner = snapshot.data.infoBanners.find(item => item.id === parsed.data.id);
    if (!banner) return noStoreJson({ error: 'Banner tidak dijumpai.' }, { status: 404 });
    const input = bannerInputSchema.safeParse({ title: parsed.data.title ?? banner.title, url: parsed.data.url ?? banner.url });
    if (!input.success) return validationError(input.error);
    const banners = remove ? snapshot.data.infoBanners.filter(item => item.id !== banner.id) : snapshot.data.infoBanners.map(item => item.id === banner.id ? { ...item, ...input.data } : item);
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { infoBanners: banners }));
    if (remove) await getPrintShopBucket().delete(banner.key).catch(() => {});
    return noStoreJson({ revision: saved.data.revision, banners: publicInfoBanners(banners) });
  } catch (error) { return jsonError(error); }
}
export async function PATCH(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
