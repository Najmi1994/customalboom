import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEUTRAL, adjustPixels, samePhoto } from '../src/domain/photoAdjustments';
import { frameSchema, makeFrame, makeProject, asTemplate, photoAdjustmentsSchema } from '../src/domain/model';
import { clampPhoto, coverPhoto, resizeElement } from '../src/domain/geometry';
import { parseProject } from '../src/io/storage';

test('neutral tone processing is byte-exact, including alpha and transparent colours', () => {
  const pixels = new Uint8ClampedArray([0, 128, 255, 0, 32, 160, 220, 127, 255, 255, 255, 255]);
  const original = pixels.slice(); adjustPixels(pixels); assert.deepEqual(pixels, original);
  adjustPixels(pixels, { ...NEUTRAL }); assert.deepEqual(pixels, original);
  adjustPixels(pixels, { ...NEUTRAL, exposure: 2, blacks: 100 });
  assert.deepEqual(pixels.slice(0, 4), original.slice(0, 4)); assert.equal(pixels[7], 127); assert.equal(pixels[11], 255);
});
test('exposure is in stops and contrast expands midtone separation', () => {
  const pixel = new Uint8ClampedArray([100, 100, 100, 255]);
  adjustPixels(pixel, { ...NEUTRAL, exposure: 1 }); assert.ok(pixel[0] >= 137 && pixel[0] <= 139);
  const ramp = new Uint8ClampedArray([64, 64, 64, 255, 192, 192, 192, 255]);
  adjustPixels(ramp, { ...NEUTRAL, contrast: 100 }); assert.ok(ramp[0] < 64); assert.ok(ramp[4] > 192);
});
test('saturation desaturates fully, increases colour separation and preserves alpha', () => {
  const source = new Uint8ClampedArray([180, 120, 90, 127, 80, 80, 80, 255, 230, 50, 10, 0]);
  const gray = source.slice(); adjustPixels(gray, { ...NEUTRAL, saturation: -100 });
  assert.equal(gray[0], gray[1]); assert.equal(gray[1], gray[2]); assert.equal(gray[3], 127);
  assert.deepEqual(gray.slice(4), source.slice(4));
  const vivid = source.slice(); adjustPixels(vivid, { ...NEUTRAL, saturation: 100 });
  assert.ok(vivid[0] - vivid[2] > source[0] - source[2]); assert.equal(vivid[3], 127);
  assert.deepEqual(vivid.slice(4), source.slice(4));
});
test('old six-slider settings default saturation to zero and invalid saturation is rejected', () => {
  const { saturation: _, ...old } = NEUTRAL;
  assert.deepEqual(photoAdjustmentsSchema.parse(old), NEUTRAL);
  for (const value of [-101, 101, NaN, Infinity]) assert.equal(photoAdjustmentsSchema.safeParse({ ...NEUTRAL, saturation: value }).success, false);
  const pixels = new Uint8ClampedArray([180, 120, 90, 255]); const original = pixels.slice();
  adjustPixels(pixels, photoAdjustmentsSchema.parse(old)); assert.deepEqual(pixels, original);
});
test('tonal masks target highlights, shadows, whites and blacks smoothly', () => {
  for (const [key, target, unaffected] of [['highlights', 220, 25], ['shadows', 25, 240], ['whites', 240, 100], ['blacks', 25, 180]] as const) {
    const pixel = new Uint8ClampedArray([target, target, target, 255, unaffected, unaffected, unaffected, 255]);
    adjustPixels(pixel, { ...NEUTRAL, [key]: 100 }); assert.ok(pixel[0] > target, key); assert.equal(pixel[4], unaffected, key);
    const darken = new Uint8ClampedArray([target, target, target, 255]);
    adjustPixels(darken, { ...NEUTRAL, [key]: -100 }); assert.ok(darken[0] < target, key);
  }
});
test('extreme tonal settings produce bounded deterministic RGB and preserve alpha', () => {
  const input = Uint8ClampedArray.from({ length: 1024 }, (_, i) => i % 4 === 3 ? 123 : Math.floor(i / 4));
  for (const sign of [-1, 1]) {
    const settings = { ...NEUTRAL, exposure: 2 * sign, contrast: 100 * sign, highlights: 100 * sign, shadows: -100 * sign, whites: 100 * sign, blacks: -100 * sign, saturation: 100 * sign };
    const a = input.slice(), b = input.slice(); adjustPixels(a, settings); adjustPixels(b, settings); assert.deepEqual(a, b);
    for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 123);
  }
});
test('adjustments round-trip per placement and legacy projects stay neutral', () => {
  const frame = makeFrame('rect', 0, 0, 200, 100); frame.photo = coverPhoto('a'.repeat(64), 600, 400, 200, 100);
  const project = makeProject(); project.pages[0].elements = [frame];
  project.assets = [{ id: frame.photo.assetId, name: 'test.png', relativePath: 'test.png', width: 600, height: 400, size: 100, lastModified: 1 }];
  assert.equal((parseProject(project).pages[0].elements[0] as typeof frame).photo?.adjustments, undefined);
  frame.photo.adjustments = { ...NEUTRAL, exposure: .5, highlights: -40 };
  const other = { ...structuredClone(frame), id: 'other', photo: coverPhoto(frame.photo.assetId, 600, 400, 200, 100) }; project.pages[0].elements.push(other);
  const saved = parseProject(JSON.parse(JSON.stringify(project))).pages[0].elements as typeof frame[];
  assert.deepEqual(saved[0].photo?.adjustments, frame.photo.adjustments); assert.equal(saved[1].photo?.adjustments, undefined);
  assert.equal((asTemplate(project.pages[0], 'test').page.elements[0] as typeof frame).photo, undefined);
  for (const bad of [NaN, Infinity, 2.01, -2.01]) assert.equal(frameSchema.safeParse({ ...frame, photo: { ...frame.photo, adjustments: { ...NEUTRAL, exposure: bad } } }).success, false);
  assert.equal(frameSchema.safeParse({ ...frame, photo: { ...frame.photo, adjustments: { ...NEUTRAL, shadows: 101 } } }).success, false);
});
test('crop, resizing and duplicate preserve tones; replacement resets; neutral is a no-op', () => {
  const frame = makeFrame('rect', 0, 0, 200, 100); frame.photo = { ...coverPhoto('asset', 600, 400, 200, 100), adjustments: { ...NEUTRAL, contrast: 30 } };
  const resized = resizeElement(frame, 300, 100, { width: 600, height: 400 });
  assert.equal(resized.type, 'frame'); if (resized.type !== 'frame') throw new Error('Expected a frame');
  assert.deepEqual(resized.photo?.adjustments, frame.photo.adjustments);
  assert.ok(Math.abs(resized.photo!.width / resized.photo!.height - 1.5) < 1e-10);
  assert.deepEqual(clampPhoto(frame.photo, 300, 200).adjustments, frame.photo.adjustments);
  assert.deepEqual(structuredClone(frame).photo?.adjustments, frame.photo.adjustments);
  const fresh = coverPhoto('asset', 600, 400, 200, 100); assert.equal(fresh.adjustments, undefined);
  assert.ok(samePhoto(fresh, { ...fresh, adjustments: { ...NEUTRAL } }));
  assert.ok(!samePhoto(fresh, frame.photo)); assert.ok(!samePhoto(fresh, { ...fresh, x: fresh.x - 1 }));
});
