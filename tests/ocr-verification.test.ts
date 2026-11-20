import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { verifyOcrPasses } from '../src/analyzers/text/verifyOcr';
import type { TextResult } from '../src/core/types';
const line = (text: string, x = 0.1) => ({ text, confidence: 90, box: { x, y: 0.1, w: 0.5, h: 0.1 } });
const result = (lines: ReturnType<typeof line>[]): TextResult => ({ engine: 'test', languages: 'eng', count: lines.length, discarded: 0, text: lines.map(x => x.text).join('\n'), coverage: 0.1, lines });
test('conserva texto consistente en dos pasadas', () => {
 const out = verifyOcrPasses(result([line('HOLA MUNDO')]), result([line('HOLA MUNDO')]));
 assert.equal(out.text, 'HOLA MUNDO'); assert.equal(out.verification?.confirmed, 1);
});
test('descarta alucinaciones y conserva diagnóstico', () => {
 const out = verifyOcrPasses(result([line('RAMAS XYZ')]), result([line('OTRA COSA')]));
 assert.equal(out.count, 0); assert.equal(out.verification?.rejected.length, 1);
});
test('rechaza texto en región distinta', () => {
 const out = verifyOcrPasses(result([line('HOLA', 0.1)]), result([line('HOLA', 0.8)]));
 assert.equal(out.text, '');
});
