import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addAnnotation, analyzeAnnotation, boxFromPoints, containsPoint, extractRegion, removeAnnotation } from '../src/annotations/engine';
import type { ImageAnnotation } from '../src/annotations/engine';
const base:ImageAnnotation={id:'p',label:'person',source:'human',createdAt:'2026-01-01',geometry:{type:'box',x:0,y:0,width:1,height:1}};
test('normalized boxes and containment',()=>{const g=boxFromPoints({x:.8,y:.7},{x:.2,y:.1});assert.equal(g.x,.2);assert.equal(g.height,.6);assert.ok(containsPoint(g,{x:.5,y:.5}));});
test('polygon excludes outside pixels',()=>{const g={type:'polygon' as const,points:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]};assert.ok(containsPoint(g,{x:.1,y:.1}));assert.ok(!containsPoint(g,{x:.9,y:.9}));});
test('hierarchy and cascading removal',()=>{const child:ImageAnnotation={...base,id:'mouth',label:'mouth',parentId:'p'};const all=addAnnotation([base],child);assert.equal(removeAnnotation(all,'p').length,0);assert.throws(()=>addAnnotation([base],{...child,id:'bad',parentId:'missing'}));});
test('region palette ignores masked pixels',()=>{const image={width:2,height:1,data:new Uint8ClampedArray([255,0,0,255,0,0,255,255])};const crop=extractRegion(image,{type:'box',x:0,y:0,width:.5,height:1});assert.equal(crop.width,1);const visual=analyzeAnnotation(image,{type:'box',x:0,y:0,width:.5,height:1});assert.equal(visual.palette[0].hex,'#ff0000');});
