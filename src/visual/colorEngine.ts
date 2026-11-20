import type { RawImage, RGB } from '../core/types';

export interface PaletteTone { hex: string; rgb: RGB; coverage: number; oklab: [number, number, number] }
export interface VisualCell { x: number; y: number; width: number; height: number; coverage: number; average: RGB; brightness: number; saturation: number; palette: PaletteTone[] }
export interface LightProfile { mean: number; median: number; p10: number; p90: number; contrast: number; shadows: number; highlights: number; dynamicRange: number }
export interface VisualProfile { method: 'oklab-kmeans'; palette: PaletteTone[]; light: LightProfile; grid: VisualCell[]; colorCenter: { x: number; y: number }; sampleCount: number; transparentFraction: number }
export interface VisualOptions { paletteSize?: number; gridSize?: number; maxSamples?: number; iterations?: number }
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const linear=(v:number)=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4};
function toLab(r:number,g:number,b:number):[number,number,number]{
 const R=linear(r),G=linear(g),B=linear(b);
 const l=Math.cbrt(.4122214708*R+.5363325363*G+.0514459929*B);
 const m=Math.cbrt(.2119034982*R+.6806995451*G+.1073969566*B);
 const s=Math.cbrt(.0883024619*R+.2817188376*G+.6299787005*B);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
const dist=(a:number[],b:number[])=> (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
const rgb=(r:number,g:number,b:number):RGB=>({r:Math.round(r),g:Math.round(g),b:Math.round(b)});
const hex=(c:RGB)=>'#'+[c.r,c.g,c.b].map(x=>x.toString(16).padStart(2,'0')).join('');
type Pixel={x:number;y:number;rgb:RGB;lab:[number,number,number];brightness:number;saturation:number};
function samples(img:RawImage,maxSamples:number){
 const pixels:Pixel[]=[];let transparent=0;const total=img.width*img.height;
 const stride=Math.max(1,Math.ceil(Math.sqrt(total/maxSamples)));
 for(let y=0;y<img.height;y+=stride)for(let x=0;x<img.width;x+=stride){
  const i=(y*img.width+x)*4, a=img.data[i+3];if(a<128){transparent++;continue;}
  const r=img.data[i],g=img.data[i+1],b=img.data[i+2];const lab=toLab(r,g,b);
  pixels.push({x,y,rgb:rgb(r,g,b),lab,brightness:clamp(.2126*linear(r)+.7152*linear(g)+.0722*linear(b)),saturation:(Math.max(r,g,b)-Math.min(r,g,b))/255});
 }
 return {pixels,transparentFraction:transparent/Math.ceil(img.width/stride)/Math.ceil(img.height/stride)};
}
function quantize(pixels:Pixel[],k:number,iterations:number):PaletteTone[]{
 if(!pixels.length)return [];
 k=Math.min(k,pixels.length);
 const centers:[number,number,number][]=[pixels[0].lab.slice() as [number,number,number]];
 // deterministic farthest-point initialization; avoids randomness across runs
 while(centers.length<k){let best=-1,chosen=pixels[0].lab;for(const p of pixels){const d=Math.min(...centers.map(c=>dist(p.lab,c)));if(d>best){best=d;chosen=p.lab}}if(best<1e-12)break;centers.push([...chosen]);}
 const groups=new Array(pixels.length).fill(0);
 for(let t=0;t<iterations;t++){
  const sums=centers.map(()=>({lab:[0,0,0],rgb:[0,0,0],n:0}));
  pixels.forEach((p,i)=>{let nearest=0,best=Infinity;centers.forEach((c,j)=>{const d=dist(p.lab,c);if(d<best){best=d;nearest=j}});groups[i]=nearest;const s=sums[nearest];s.n++;for(let j=0;j<3;j++){s.lab[j]+=p.lab[j];s.rgb[j]+=[p.rgb.r,p.rgb.g,p.rgb.b][j]}});
  sums.forEach((s,i)=>{if(s.n)centers[i]=s.lab.map(v=>v/s.n) as [number,number,number]});
 }
 const sums=centers.map(()=>({r:0,g:0,b:0,n:0}));
 pixels.forEach(p=>{let j=0,best=Infinity;centers.forEach((c,i)=>{const d=dist(p.lab,c);if(d<best){best=d;j=i}});const s=sums[j];s.r+=p.rgb.r;s.g+=p.rgb.g;s.b+=p.rgb.b;s.n++});
 return sums.filter(s=>s.n).map(s=>{const c=rgb(s.r/s.n,s.g/s.n,s.b/s.n);return {rgb:c,hex:hex(c),coverage:s.n/pixels.length,oklab:toLab(c.r,c.g,c.b)}}).sort((a,b)=>b.coverage-a.coverage);
}
function light(pixels:Pixel[]):LightProfile{
 if(!pixels.length)return {mean:0,median:0,p10:0,p90:0,contrast:0,shadows:0,highlights:0,dynamicRange:0};
 const v=pixels.map(p=>p.brightness).sort((a,b)=>a-b), n=v.length, q=(f:number)=>v[Math.floor(f*(n-1))];
 const mean=v.reduce((a,b)=>a+b,0)/n, contrast=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/n);
 return {mean,median:q(.5),p10:q(.1),p90:q(.9),contrast,shadows:v.filter(x=>x<.1).length/n,highlights:v.filter(x=>x>.9).length/n,dynamicRange:q(.9)-q(.1)};
}
/** Deterministic, DOM-free perceptual color analysis. Alpha < 128 is ignored. */
export function analyzeVisual(img:RawImage,options:VisualOptions={}):VisualProfile{
 if(img.width<=0||img.height<=0||img.data.length!==img.width*img.height*4)throw new Error('Invalid RGBA image');
 const k=Math.max(1,Math.min(32,Math.floor(options.paletteSize??8)));
 const gridSize=Math.max(1,Math.min(8,Math.floor(options.gridSize??3)));
 const maxSamples=Math.max(64,Math.min(100000,Math.floor(options.maxSamples??12000)));
 const iterations=Math.max(1,Math.min(30,Math.floor(options.iterations??8)));
 const {pixels,transparentFraction}=samples(img,maxSamples);
 const grid:VisualCell[]=[];
 for(let gy=0;gy<gridSize;gy++)for(let gx=0;gx<gridSize;gx++){
  const cell=pixels.filter(p=>Math.min(gridSize-1,Math.floor(p.x/img.width*gridSize))===gx&&Math.min(gridSize-1,Math.floor(p.y/img.height*gridSize))===gy);
  const avg=cell.length?rgb(cell.reduce((a,p)=>a+p.rgb.r,0)/cell.length,cell.reduce((a,p)=>a+p.rgb.g,0)/cell.length,cell.reduce((a,p)=>a+p.rgb.b,0)/cell.length):rgb(0,0,0);
  grid.push({x:gx/gridSize,y:gy/gridSize,width:1/gridSize,height:1/gridSize,coverage:pixels.length?cell.length/pixels.length:0,average:avg,brightness:light(cell).mean,saturation:cell.length?cell.reduce((a,p)=>a+p.saturation,0)/cell.length:0,palette:quantize(cell,Math.min(4,k),iterations)});
 }
 // chroma-weighted center: saturated regions exert greater influence
 let sx=0,sy=0,sw=0;for(const p of pixels){const w=p.saturation+.001;sx+=(p.x+.5)/img.width*w;sy+=(p.y+.5)/img.height*w;sw+=w}
 return {method:'oklab-kmeans',palette:quantize(pixels,k,iterations),light:light(pixels),grid,colorCenter:{x:sw?sx/sw:.5,y:sw?sy/sw:.5},sampleCount:pixels.length,transparentFraction};
}
