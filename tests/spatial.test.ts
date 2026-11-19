import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzePixels } from '../src/core/analyzer';
import { matchesSpatial } from '../src/search/spatial';
import { rankImages } from '../src/search/queryEngine';
const pixels = { width: 4, height: 4, data: new Uint8ClampedArray(4*4*4) };
const source = { filename: 'test.png', bytes: 64, mime: 'image/png', width: 4, height: 4 };
const d = analyzePixels(pixels,source);
d.objects = { model: 'test', count: 2, counts: { person: 1, dog: 1 }, items: [
  { class:'person',label:'persona',score:0.9,box:{x:0.1,y:0.1,w:0.2,h:0.5},areaRatio:0.1,position:'middle-left' },
  { class:'dog',label:'perro',score:0.8,box:{x:0.6,y:0.4,w:0.2,h:0.2},areaRatio:0.04,position:'middle-right' }
] };
const person = { type:'object' as const, value:'person' };
const dog = { type:'object' as const, value:'dog' };
test('object position and count', () => {
 assert.equal(matchesSpatial(d,{entities:[{...person,region:'top-left'}]}),true);
 assert.equal(matchesSpatial(d,{entities:[{...dog,minCount:2}]}),false);
});
test('directional relations', () => {
 assert.equal(matchesSpatial(d,{relations:[{subject:person,relation:'left-of',target:dog}]}),true);
 assert.equal(matchesSpatial(d,{relations:[{subject:person,relation:'right-of',target:dog}]}),false);
});
test('missing detector is not empty', () => {
 const without = {...d,objects:undefined};
 assert.equal(matchesSpatial(without,{entities:[person]}),false);
});
test('spatial query integrates with ranking', () => {
 assert.equal(rankImages([d],{spatial:{relations:[{subject:person,relation:'left-of',target:dog}]}}).length,1);
});
