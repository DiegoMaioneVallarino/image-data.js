import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VisualIndex } from '../src/semantic/index';
import { cosineSimilarity, embedImage, embedText } from '../src/semantic/embeddings';
import { analyzePixels } from '../src/core/analyzer';

test('cosine and invalid dimensions', () => {
  assert.ok(Math.abs(cosineSimilarity([1,0],[1,0])-1)<1e-12);
  assert.ok(Math.abs(cosineSimilarity([1,0],[0,1]))<1e-12);
  assert.throws(() => cosineSimilarity([1],[1,0]));
  assert.throws(() => cosineSimilarity([0,0],[1,0]));
});
test('index ranking, model isolation and persistence', () => {
  const index = new VisualIndex();
  index.add({imageId:'a',modelId:'clip-a',vector:[1,0]});
  index.add({imageId:'b',modelId:'clip-a',vector:[0,1]});
  index.add({imageId:'c',modelId:'clip-b',vector:[1,0]});
  assert.deepEqual(index.search([1,0],{modelId:'clip-a'}).map(x=>x.imageId),['a','b']);
  assert.deepEqual(VisualIndex.fromRecords(index.exportRecords()).search([1,0],{modelId:'clip-b'}).map(x=>x.imageId),['c']);
  assert.throws(() => index.add({imageId:'d',modelId:'clip-a',vector:[1,0,0]}));
});
test('combined visual and metadata filtering', () => {
  const source={filename:'a.png',bytes:64,mime:'image/png',width:4,height:4};
  const d=analyzePixels({width:4,height:4,data:new Uint8ClampedArray(64)},source);
  d.id='a';
  const idx=new VisualIndex();idx.add({imageId:'a',modelId:'mock',vector:[1,0]});
  assert.equal(idx.searchFiltered([1,0],{modelId:'mock'},[d],{orientation:'square'}).length,1);
  assert.equal(idx.searchFiltered([1,0],{modelId:'mock'},[d],{orientation:'portrait'}).length,0);
});
test('provider adapter accepts image and text', async () => {
  const provider={modelId:'mock',async embedImage(_blob:Blob){return [3,4]},async embedText(_text:string){return [4,3]}};
  const record=await embedImage(provider,new Blob(['abc']),'a');
  assert.ok(Math.abs(record.vector[0]-0.6)<1e-12);
  assert.equal((await embedText(provider,'gato')).length,2);
});
