import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzePixels } from '../src/core/analyzer';
import { searchImages } from '../src/search/queryEngine';
import { SCHEMA_VERSION, migrate } from '../src/core/schema';

const pixels = { width: 4, height: 4, data: new Uint8ClampedArray(Array.from({ length: 16 }, () => [0, 0, 255, 255]).flat()) };
const source = { filename: 'azul.png', bytes: 64, mime: 'image/png', width: 4, height: 4 };

test('analiza píxeles sin depender del DOM', () => {
  const d = analyzePixels(pixels, source);
  assert.equal(d.version, SCHEMA_VERSION);
  assert.equal(d.metadata.width, 4);
  assert.ok(d.colors.average.b > d.colors.average.r);
});

test('filtro por orientación devuelve resultados correctos', () => {
  const d = analyzePixels(pixels, source);
  assert.equal(searchImages([d], { orientation: 'portrait' }).length, 0);
  assert.equal(searchImages([d], { orientation: 'square' }).length, 1);
});

test('el esquema rechaza versiones irrecuperables', () => {
  assert.equal(migrate({ version: '0.1.0' }), null);
});
