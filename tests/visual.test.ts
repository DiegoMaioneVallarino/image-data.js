import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeVisual } from '../src/visual/colorEngine';
function image(w:number,h:number,fn:(x:number,y:number)=>number[]){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),(y*w+x)*4);return {width:w,height:h,data}}
test('solid color produces a single palette tone',()=>{const v=analyzeVisual(image(10,10,()=>[255,0,0,255]));assert.equal(v.palette.length,1);assert.equal(v.palette[0].hex,'#ff0000');assert.equal(v.palette[0].coverage,1)});
test('split colors and spatial grid',()=>{const v=analyzeVisual(image(30,30,(x)=>x<15?[0,0,255,255]:[255,0,0,255]),{paletteSize:2});assert.equal(v.palette.length,2);assert.ok(Math.abs(v.palette.reduce((a,p)=>a+p.coverage,0)-1)<1e-8);assert.ok(v.grid[0].average.b>v.grid[2].average.b)});
test('transparent pixels are excluded',()=>{const v=analyzeVisual(image(2,1,x=>x?[255,0,0,0]:[0,255,0,255]));assert.equal(v.palette[0].hex,'#00ff00');assert.equal(v.transparentFraction,.5)});
test('empty alpha returns no palette',()=>{const v=analyzeVisual(image(2,2,()=>[0,0,0,0]));assert.equal(v.palette.length,0);assert.equal(v.light.mean,0)});
