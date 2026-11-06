import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleFramePhotos } from '../src/domain/photoCycle';
import { coverPhoto } from '../src/domain/geometry';
import { makeFrame, type FrameElement, type PhotoAssetRef } from '../src/domain/model';
import { NEUTRAL } from '../src/domain/photoAdjustments';

function asset(id: string, width: number, height: number): PhotoAssetRef {
  return { id, name: `${id}.jpg`, relativePath: `${id}.jpg`, width, height, size: 1, lastModified: 1 };
}
function photoFrame(id: string, x: number, y: number, width: number, height: number, photo?: PhotoAssetRef): FrameElement {
  const frame = makeFrame('rect', x, y, width, height);
  frame.id = id;
  if (photo) frame.photo = coverPhoto(photo.id, photo.width, photo.height, width, height);
  return frame;
}

test('two selected frames swap photos in one complete update map', () => {
  const a = asset('a', 600, 400), b = asset('b', 400, 600);
  const first = photoFrame('first', 0, 0, 200, 100, a), second = photoFrame('second', 250, 0, 100, 200, b);
  const result = cycleFramePhotos([second, first], new Map([[a.id, a], [b.id, b]]));
  assert.deepEqual(result.ordered.map(frame => frame.id), ['first', 'second']);
  assert.equal(result.updates.get('first')?.photo?.assetId, b.id);
  assert.equal(result.updates.get('second')?.photo?.assetId, a.id);
  assert.equal(result.updates.size, 2);
});

test('three frames cycle top-to-bottom then left-to-right and include an empty slot', () => {
  const a = asset('a', 600, 400), b = asset('b', 400, 600), assets = new Map([[a.id, a], [b.id, b]]);
  const topLeft = photoFrame('top-left', 0, 0, 100, 100, a);
  const topRight = photoFrame('top-right', 200, 0, 100, 100);
  const bottom = photoFrame('bottom', 50, 200, 100, 100, b);
  const first = cycleFramePhotos([bottom, topRight, topLeft], assets);
  assert.deepEqual(first.ordered.map(frame => frame.id), ['top-left', 'top-right', 'bottom']);
  assert.equal(first.updates.get('top-left')?.photo?.assetId, b.id);
  assert.equal(first.updates.get('top-right')?.photo?.assetId, a.id);
  assert.equal(first.updates.get('bottom')?.photo, undefined);
  const secondFrames = [topLeft, topRight, bottom].map(frame => first.updates.get(frame.id)!);
  const second = cycleFramePhotos(secondFrames, assets);
  assert.equal(second.updates.get('top-left')?.photo, undefined);
  assert.equal(second.updates.get('top-right')?.photo?.assetId, b.id);
  assert.equal(second.updates.get('bottom')?.photo?.assetId, a.id);
});

test('moving into a different aspect ratio preserves focal point and adjustments while covering', () => {
  const a = asset('a', 400, 200), b = asset('b', 200, 400), assets = new Map([[a.id, a], [b.id, b]]);
  const landscape = photoFrame('landscape', 0, 0, 100, 100, a), portrait = photoFrame('portrait', 200, 0, 100, 200, b);
  landscape.photo = { ...landscape.photo!, x: -60, adjustments: { ...NEUTRAL, exposure: .5, saturation: 20 } };
  const originalFocusX = (landscape.width / 2 - landscape.photo.x) / landscape.photo.width;
  const moved = cycleFramePhotos([landscape, portrait], assets).updates.get('portrait')!.photo!;
  const movedFocusX = (portrait.width / 2 - moved.x) / moved.width;
  assert.ok(Math.abs(originalFocusX - movedFocusX) < 1e-10);
  assert.ok(moved.width >= portrait.width && moved.height >= portrait.height);
  assert.equal(moved.width / moved.height, a.width / a.height);
  assert.deepEqual(moved.adjustments, landscape.photo.adjustments);
});

test('project asset metadata is sufficient and a missing record fails without partial output', () => {
  const a = asset('a', 600, 400), first = photoFrame('first', 0, 0, 100, 100, a), second = photoFrame('second', 200, 0, 100, 100);
  assert.equal(cycleFramePhotos([first, second], new Map([[a.id, a]])).updates.get('second')?.photo?.assetId, a.id);
  assert.throws(() => cycleFramePhotos([first, second], new Map()), /missing its project metadata/);
});
