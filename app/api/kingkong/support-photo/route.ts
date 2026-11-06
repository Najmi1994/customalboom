import { z } from 'zod';
import { detectBanner, MAX_BANNER_BYTES } from '../../../../src/info/domain';
import { adminSnapshot, isSameOrigin } from '../../../../src/print-shops/server-auth';
import { jsonError, noStoreJson } from '../../../../src/print-shops/http';
import { getPrintShopBucket, nextStorePatch, StoreConflictError, writeStyleStore } from '../../../../src/print-shops/store';

async function mutate(request: Request, remove: boolean) {
  if (!isSameOrigin(request)) return noStoreJson({ error: 'Invalid request origin.' }, { status: 403 });
  let uploaded: string | undefined;
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: 'Sesi admin diperlukan.' }, { status: 401 });
    if (Number(request.headers.get('content-length')) > MAX_BANNER_BYTES + 16384) return noStoreJson({ error: 'Maksimum 3 MB.' }, { status: 413 });
    const form = remove ? null : await request.formData();
    const revision = remove ? z.object({ revision: z.number().int().min(0) }).parse(await request.json()).revision : Number(form!.get('revision'));
    if (revision !== snapshot.data.revision) throw new StoreConflictError('Data berubah. Muat semula halaman dahulu.');
    let portrait = undefined as typeof snapshot.data.supportSettings.portrait;
    if (!remove) {
      const file = form!.get('image');
      if (!(file instanceof File) || !file.size || file.size > MAX_BANNER_BYTES) return noStoreJson({ error: 'Pilih PNG, JPEG atau WebP, maksimum 3 MB.' }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer()), detected = detectBanner(bytes);
      if (!detected) return noStoreJson({ error: 'Format gambar tidak sah.' }, { status: 400 });
      portrait = { id: crypto.randomUUID(), extension: detected.extension as 'png' | 'jpg' | 'webp' };
      uploaded = `support-photos/${portrait.id}.${portrait.extension}`;
      await getPrintShopBucket().put(uploaded, bytes);
    }
    const previous = snapshot.data.supportSettings.portrait;
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { supportSettings: { ...snapshot.data.supportSettings, portrait } }));
    uploaded = undefined;
    if (previous) await getPrintShopBucket().delete(`support-photos/${previous.id}.${previous.extension}`).catch(() => {});
    return noStoreJson({ revision: saved.data.revision, portrait: portrait ?? null });
  } catch (error) {
    if (uploaded) await getPrintShopBucket().delete(uploaded).catch(() => {});
    return jsonError(error);
  }
}
export async function POST(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
