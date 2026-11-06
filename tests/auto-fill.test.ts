import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAutoFillPhotos } from '../src/domain/autoFill';

const portrait = (id: string) => ({ id, width: 200, height: 300 });
const landscape = (id: string) => ({ id, width: 300, height: 200 });
const square = (id: string) => ({ id, width: 200, height: 200 });

test('auto-fill matches orientations regardless of photo order, including squares', () => {
  const result = matchAutoFillPhotos([portrait('a'), landscape('b'), square('c')], [square('square'), landscape('wide'), portrait('tall')]);
  assert.deepEqual([...result].map(([frame, photo]) => [frame, photo.id]), [['a', 'tall'], ['b', 'wide'], ['c', 'square']]);
});

test('an early unmatched frame cannot steal a later frame’s matching photo', () => {
  const result = matchAutoFillPhotos([landscape('a'), portrait('b')], [portrait('tall')]);
  assert.equal(result.has('a'), false);
  assert.equal(result.get('b')?.id, 'tall');
});

test('leftovers fill unmatched frames without duplicates', () => {
  const result = matchAutoFillPhotos([landscape('a'), portrait('b'), landscape('c')], [portrait('tall1'), portrait('tall2')]);
  assert.equal(result.size, 2);
  assert.equal(result.get('b')?.id, 'tall1');
  assert.equal(result.get('a')?.id, 'tall2');
});

test('closest aspect ratio wins within orientation and ties keep input order', () => {
  const result = matchAutoFillPhotos([landscape('a'), landscape('b')], [{ id: 'panorama', width: 500, height: 100 }, landscape('first'), landscape('second')]);
  assert.equal(result.get('a')?.id, 'first');
  assert.equal(result.get('b')?.id, 'second');
});

test('duplicate mode reuses matching orientation while spreading use across photos', () => {
  const result = matchAutoFillPhotos([portrait('a'), portrait('b'), portrait('c'), landscape('d')], [portrait('tall1'), portrait('tall2'), landscape('wide')], true);
  assert.deepEqual([...result.values()].map(photo => photo.id), ['tall1', 'tall2', 'tall1', 'wide']);
});

test('duplicate mode falls back when no matching orientation exists', () => {
  assert.equal(matchAutoFillPhotos([portrait('a'), portrait('b')], [landscape('wide')], true).size, 2);
});

test('empty inputs and duplicate candidate IDs cannot cause unintended reuse', () => {
  assert.equal(matchAutoFillPhotos([portrait('a')], []).size, 0);
  assert.equal(matchAutoFillPhotos([], [portrait('photo')]).size, 0);
  assert.equal(matchAutoFillPhotos([portrait('a'), portrait('b')], [portrait('photo'), portrait('photo')]).size, 1);
});
