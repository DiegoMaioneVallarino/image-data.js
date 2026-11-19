import type { ImageDescriptor, RegionName } from '../core/types';

export type SpatialEntity = 'object' | 'face' | 'text';
export type SpatialRelation = 'left-of' | 'right-of' | 'above' | 'below' | 'overlaps' | 'inside' | 'contains' | 'near';
export interface Box { x: number; y: number; w: number; h: number }
export interface SpatialSelector {
  type: SpatialEntity;
  /** For objects: COCO class or Spanish label; for text: substring. */
  value?: string;
  region?: RegionName;
  minScore?: number;
  minArea?: number;
  maxArea?: number;
}
export interface SpatialConstraint {
  subject: SpatialSelector;
  relation: SpatialRelation;
  target: SpatialSelector;
  /** For 'near', normalized center-to-center distance (default 0.25). */
  maxDistance?: number;
  /** For overlap, minimum intersection / smaller box area (default 0). */
  minOverlap?: number;
}
export interface SpatialQuery {
  /** Every selector must match at least minCount instances; defaults to 1. */
  entities?: Array<SpatialSelector & { minCount?: number; maxCount?: number }>;
  /** Every relation must match at least one pair of distinct detections. */
  relations?: SpatialConstraint[];
}
interface Instance { box: Box; score: number; value: string; type: SpatialEntity }
const normalize = (v: string) => v.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const area = (b: Box) => b.w * b.h;
const region = (b: Box): RegionName => {
  const c = center(b);
  const x = c.x < 1/3 ? 'left' : c.x < 2/3 ? 'center' : 'right';
  const y = c.y < 1/3 ? 'top' : c.y < 2/3 ? 'middle' : 'bottom';
  return x === 'center' && y === 'middle' ? 'center' : `${y}-${x}` as RegionName;
};
function instances(d: ImageDescriptor, selector: SpatialSelector): Instance[] | null {
  // Missing analysis is unknown, never interpreted as a negative detection.
  if (selector.type === 'object' && !d.objects) return null;
  if (selector.type === 'face' && !d.faces) return null;
  if (selector.type === 'text' && !d.text) return null;
  const all: Instance[] = selector.type === 'object'
    ? d.objects!.items.map(o => ({ type: 'object', box: o.box, score: o.score, value: `${o.class}|${o.label}` }))
    : selector.type === 'face'
    ? d.faces!.items.map(f => ({ type: 'face', box: f.box, score: f.score, value: '' }))
    : d.text!.lines.map(t => ({ type: 'text', box: t.box, score: t.confidence / 100, value: t.text }));
  return all.filter(i => (!selector.value || (selector.type === 'object'
      ? i.value.split('|').some(v => normalize(v) === normalize(selector.value!))
      : normalize(i.value).includes(normalize(selector.value!))))
    && (selector.region === undefined || region(i.box) === selector.region)
    && (selector.minScore === undefined || i.score >= selector.minScore)
    && (selector.minArea === undefined || area(i.box) >= selector.minArea)
    && (selector.maxArea === undefined || area(i.box) <= selector.maxArea));
}
function related(a: Box, b: Box, r: SpatialRelation, q: SpatialConstraint): boolean {
  const ac = center(a), bc = center(b);
  const overlapW = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const overlapH = Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  switch (r) {
    case 'left-of': return ac.x < bc.x;
    case 'right-of': return ac.x > bc.x;
    case 'above': return ac.y < bc.y;
    case 'below': return ac.y > bc.y;
    case 'inside': return a.x >= b.x && a.y >= b.y && a.x+a.w <= b.x+b.w && a.y+a.h <= b.y+b.h;
    case 'contains': return related(b,a,'inside',q);
    case 'overlaps': return overlapW * overlapH > 0 && overlapW * overlapH / Math.min(area(a),area(b)) >= (q.minOverlap ?? 0);
    case 'near': return Math.hypot(ac.x-bc.x, ac.y-bc.y) <= (q.maxDistance ?? 0.25);
  }
}
/** All predicates are ANDed. A missing detector result never satisfies a predicate. */
export function matchesSpatial(d: ImageDescriptor, q: SpatialQuery): boolean {
  for (const e of q.entities ?? []) {
    const found = instances(d,e);
    if (!found || found.length < (e.minCount ?? 1) || (e.maxCount !== undefined && found.length > e.maxCount)) return false;
  }
  for (const r of q.relations ?? []) {
    const subjects = instances(d,r.subject), targets = instances(d,r.target);
    if (!subjects || !targets || !subjects.some(a => targets.some(b => a !== b && related(a.box,b.box,r.relation,r)))) return false;
  }
  return true;
}
