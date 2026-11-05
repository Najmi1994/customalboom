import { cutFrame, cutSchema } from '@/src/server/cutter';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');

const allowedOrigin = 'https://customalboom.com';

if (
  !origin ||
  origin !== allowedOrigin ||
  request.headers.get('sec-fetch-site') === 'cross-site'
) {
  return Response.json(
    { error: 'Origin not allowed.' },
    { status: 403 }
  );
}
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
  if (Number(request.headers.get('content-length')) > 65536) return Response.json({ error: 'Request too large.' }, { status: 413 });
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error('Missing request.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); return Response.json({ error: 'Request too large.' }, { status: 413 }); } chunks.push(value); }
    const data = new Uint8Array(size); let at = 0; for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
    const parsed = cutSchema.safeParse(JSON.parse(new TextDecoder().decode(data)));
    if (!parsed.success) return Response.json({ error: 'Invalid geometry. Cutter works on empty frames only.' }, { status: 400 });
    return Response.json({ pieces: cutFrame(parsed.data) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to cut this frame.' }, { status: 422 }); }
}
