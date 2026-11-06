import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { coverPhoto } from '../src/domain/geometry';
import { makeFrame, makeProject, setProjectFramesLocked, type PhotoAssetRef } from '../src/domain/model';
import { assertPhotoHash, type PhotoLibrary } from '../src/io/photos';
import { prepareProjectPackage, readProjectPackage, usedProjectPhotoIds, writeProjectPackage, type ProjectPackageWritable } from '../src/io/projectPackage';

class MemoryWritable implements ProjectPackageWritable {
  chunks: Uint8Array<ArrayBuffer>[] = [];
  closed = false;
  aborted = false;
  async write(chunk: Uint8Array<ArrayBuffer>) { this.chunks.push(new Uint8Array(chunk) as Uint8Array<ArrayBuffer>); }
  async close() { this.closed = true; }
  async abort() { this.aborted = true; }
  file(name = 'album.canpack') { return new File(this.chunks, name, { type: 'application/zip' }); }
}

async function hash(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function photoFixture() {
  const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217]), id = await hash(bytes), file = new File([bytes], 'moment.jpg', { type: 'image/jpeg', lastModified: 1234 });
  const ref: PhotoAssetRef = { id, name: file.name, relativePath: file.name, width: 1200, height: 800, size: file.size, lastModified: file.lastModified };
  return { id, file, ref, local: { ref, file, previewUrl: 'blob:test', image: {} as HTMLImageElement } };
}

test('portable package collects used frame and background photos once', async () => {
  const fixture = await photoFixture(), project = makeProject(), frame = makeFrame('rect', 0, 0, 200, 100);
  frame.photo = coverPhoto(fixture.id, 1200, 800, 200, 100); project.pages[0].elements = [frame]; project.pages[0].backgroundPhoto = coverPhoto(fixture.id, 1200, 800, 1296, 864); project.assets = [fixture.ref];
  assert.deepEqual(usedProjectPhotoIds(project), [fixture.id]);
  assert.equal(prepareProjectPackage(project, new Map([[fixture.id, fixture.local]])).manifest.assets.length, 1);
});

test('portable package streams and reopens the unchanged project and original bytes', async () => {
  const fixture = await photoFixture(), project = makeProject(), frame = makeFrame('rect', 10, 10, 200, 100), library: PhotoLibrary = new Map([[fixture.id, fixture.local]]);
  frame.photo = coverPhoto(fixture.id, 1200, 800, 200, 100); project.pages[0].elements = [frame]; project.assets = [fixture.ref];
  const lockedProject = setProjectFramesLocked(project, true);
  const writable = new MemoryWritable(), progress: number[] = [];
  await writeProjectPackage(lockedProject, library, writable, { onProgress: value => progress.push(value.completed) });
  assert.equal(writable.closed, true); assert.equal(writable.aborted, false); assert.equal(progress.at(-1), 3);
  const opened = await readProjectPackage(writable.file());
  assert.deepEqual(opened.project, lockedProject); assert.equal(opened.project.framesLocked, true); assert.equal(opened.photos.length, 1); assert.equal(opened.photos[0].asset.id, fixture.id);
  assert.deepEqual(new Uint8Array(await opened.photos[0].file.arrayBuffer()), new Uint8Array(await fixture.file.arrayBuffer()));
});

test('portable package supports projects without photos', async () => {
  const project = makeProject(), writable = new MemoryWritable();
  await writeProjectPackage(project, new Map(), writable);
  const opened = await readProjectPackage(writable.file());
  assert.deepEqual(opened.project, project); assert.deepEqual(opened.photos, []);
});

test('portable package refuses missing photos and packages at the 2 GB boundary', async () => {
  const project = makeProject(), frame = makeFrame('rect', 0, 0, 100, 100), id = 'a'.repeat(64);
  frame.photo = coverPhoto(id, 1000, 1000, 100, 100); project.pages[0].elements = [frame];
  assert.throws(() => prepareProjectPackage(project, new Map()), /missing/i);

  const huge = makeProject(), library: PhotoLibrary = new Map(); huge.pages[0].elements = [];
  for (let index = 0; index < 21; index++) {
    const assetId = index.toString(16).padStart(64, '0'), item = makeFrame('rect', index, 0, 1, 1), file = { name: `${index}.jpg`, type: 'image/jpeg', size: 99_000_000, lastModified: 0 } as File;
    item.photo = coverPhoto(assetId, 100, 100, 1, 1); huge.pages[0].elements.push(item);
    const ref = { id: assetId, name: file.name, relativePath: file.name, width: 100, height: 100, size: file.size, lastModified: 0 };
    library.set(assetId, { ref, file, previewUrl: '', image: {} as HTMLImageElement });
  }
  assert.throws(() => prepareProjectPackage(huge, library), /2 GB/);
});

test('portable package rejects unsupported versions, unsafe paths and unexpected entries', async () => {
  const project = makeProject(), baseManifest = { kind: 'customalboom-project-package', version: 1, project: 'project.json', assets: [] };
  const archive = (manifest: unknown, extra: Record<string, Uint8Array> = {}) => new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'project.json': strToU8(JSON.stringify(project)), ...extra }, { level: 0 }) as Uint8Array<ArrayBuffer>], 'bad.canpack');
  await assert.rejects(() => readProjectPackage(archive({ ...baseManifest, version: 2 })), /version|invalid|literal/i);
  await assert.rejects(() => readProjectPackage(archive(baseManifest, { '../secret.txt': strToU8('no') })), /unsafe/i);
  await assert.rejects(() => readProjectPackage(archive(baseManifest, { 'extra.txt': strToU8('no') })), /unexpected/i);
});

test('portable package cancellation aborts the destination and photo hashes are enforced', async () => {
  const writable = new MemoryWritable(), controller = new AbortController(); controller.abort();
  await assert.rejects(() => writeProjectPackage(makeProject(), new Map(), writable, { signal: controller.signal }), /abort|cancel/i);
  assert.equal(writable.aborted, true);
  assert.throws(() => assertPhotoHash('a'.repeat(64), 'b'.repeat(64)), /integrity/i);
});
