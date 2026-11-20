import type { RawImage } from '../core/types';
import { analyzeVisual, type VisualOptions, type VisualProfile } from '../visual/colorEngine';

export type Point = { x: number; y: number }; // normalized 0..1
export type AnnotationGeometry =
  | { type: 'box'; x: number; y: number; width: number; height: number }
  | { type: 'polygon'; points: Point[] };
export interface ImageAnnotation {
  id: string;
  label: string;
  parentId?: string;
  geometry: AnnotationGeometry;
  source: 'human' | 'api';
  createdAt: string;
  visual?: VisualProfile;
}
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export function boxFromPoints(a: Point, b: Point): AnnotationGeometry & {type:'box'} {
  const x = Math.min(clamp01(a.x), clamp01(b.x));
  const y = Math.min(clamp01(a.y), clamp01(b.y));
  return { type: 'box', x, y, width: Math.abs(clamp01(b.x)-clamp01(a.x)), height: Math.abs(clamp01(b.y)-clamp01(a.y)) };
}
export function validateAnnotation(a: ImageAnnotation, existing: ImageAnnotation[] = []): void {
  if (!a.id || !a.label.trim()) throw new Error('Annotation requires an id and label');
  if (a.geometry.type === 'box') {
    const {x,y,width,height} = a.geometry;
    if (![x,y,width,height].every(Number.isFinite) || x<0 || y<0 || width<=0 || height<=0 || x+width>1.000001 || y+height>1.000001) throw new Error('Invalid box');
  } else {
    if (a.geometry.points.length<3 || a.geometry.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1)) throw new Error('Invalid polygon');
  }
  if (a.parentId) {
    if (a.parentId===a.id) throw new Error('Annotation cannot parent itself');
    const byId = new Map(existing.map(e=>[e.id,e]));
    if (!byId.has(a.parentId)) throw new Error('Parent not found');
    const visited = new Set([a.id]); let parent: string|undefined = a.parentId;
    while(parent) { if(visited.has(parent)) throw new Error('Annotation cycle'); visited.add(parent); parent=byId.get(parent)?.parentId; }
  }
}
export function addAnnotation(items: ImageAnnotation[], a: ImageAnnotation): ImageAnnotation[] {
  if(items.some(i=>i.id===a.id)) throw new Error('Duplicate annotation id');
  validateAnnotation(a, items); return [...items,a];
}
export function removeAnnotation(items: ImageAnnotation[], id: string): ImageAnnotation[] {
  const removed = new Set([id]); let changed = true;
  while(changed) { changed=false; for(const item of items) if(item.parentId && removed.has(item.parentId) && !removed.has(item.id)) {removed.add(item.id);changed=true;} }
  return items.filter(a=>!removed.has(a.id));
}
export function containsPoint(g: AnnotationGeometry, p: Point): boolean {
  if(g.type==='box') return p.x>=g.x && p.x<=g.x+g.width && p.y>=g.y && p.y<=g.y+g.height;
  let inside=false; const pts=g.points;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++) {
    const a=pts[i],b=pts[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
/** Crop masked RGBA pixels to a tight bounding rectangle; outside the selection becomes transparent. */
export function extractRegion(image: RawImage, geometry: AnnotationGeometry): RawImage {
  if(image.width<=0 || image.height<=0 || image.data.length!==image.width*image.height*4) throw new Error('Invalid RGBA image');
  const points = geometry.type==='box' ? [{x:geometry.x,y:geometry.y},{x:geometry.x+geometry.width,y:geometry.y+geometry.height}] : geometry.points;
  if(!points.length) throw new Error('Empty geometry');
  const x0=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))*image.width));
  const y0=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))*image.height));
  const x1=Math.min(image.width,Math.ceil(Math.max(...points.map(p=>p.x))*image.width));
  const y1=Math.min(image.height,Math.ceil(Math.max(...points.map(p=>p.y))*image.height));
  if(x1<=x0 || y1<=y0) throw new Error('Empty region');
  const width=x1-x0,height=y1-y0,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const px=x0+x,py=y0+y;
    if(!containsPoint(geometry,{x:(px+.5)/image.width,y:(py+.5)/image.height})) continue;
    const source=(py*image.width+px)*4,target=(y*width+x)*4;
    data.set(image.data.subarray(source,source+4),target);
  }
  return {width,height,data};
}
export function analyzeAnnotation(image: RawImage, geometry: AnnotationGeometry, options: VisualOptions = {}): VisualProfile {
  return analyzeVisual(extractRegion(image,geometry),options);
}
