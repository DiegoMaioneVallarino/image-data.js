import { matchesSpatial } from './spatial';
import type { SpatialQuery } from './spatial';
import type { ColorName, ImageDescriptor, ImageKind, Orientation, RegionName, Temperature } from '../core/types';

export interface ImageQuery {
  /** Spatial predicates on detected objects, faces and OCR text. */
  spatial?: SpatialQuery;
  orientation?: Orientation;
  hasTransparency?: boolean;
  minBrightness?: number; maxBrightness?: number;
  minSaturation?: number; maxSaturation?: number;
  minEdgeDensity?: number; maxEdgeDensity?: number;
  /** Nombre de color; basta que ocupe `minColorShare` % de los píxeles (por defecto 15). */
  colorName?: ColorName; minColorShare?: number;
  temperature?: Temperature;
  /** Color objetivo en hex; pasa si algún color de la paleta está a <= maxColorDistance (0..1, por defecto 0.2). */
  dominantHex?: string; maxColorDistance?: number;
  /** Filtros de rostros. Una imagen sin datos de rostros (modelo no cargado) no pasa ninguno de ellos. */
  minFaces?: number; maxFaces?: number;
  /** Algún rostro con el centro en esta celda 3x3 */
  facePosition?: RegionName;
  /** El rostro más grande ocupa al menos esta fracción (0..1) de la imagen */
  minFaceArea?: number;
  /** Objeto presente: clase COCO en inglés ('person', 'dog') o su nombre en español ('persona', 'perro'). Una imagen sin datos de objetos no pasa. */
  hasObject?: string; /** Mínimo de detecciones de ese objeto (por defecto 1). */ minObjectCount?: number;
  /** Texto libre contra descripción, etiquetas y texto leído por OCR, sin distinguir mayúsculas ni acentos; deben aparecer todas las palabras. */
  text?: string;
  /** Tipo de imagen. Las que no tienen `kind` (índice migrado) no pasan este filtro. */
  kind?: ImageKind;
  /** Con true, solo imágenes donde el OCR leyó texto; con false, solo las analizadas sin texto. Sin datos de OCR no pasan. */
  hasText?: boolean;
  /** relevance (por defecto) ordena por cercanía a lo pedido; el resto ordena por el campo indicado. */
  sortBy?: 'relevance' | 'brightness' | 'saturation' | 'newest';
}
export interface SearchHit { descriptor: ImageDescriptor; /** 0..1 */ score: number }

const HEX = /^#?([0-9a-f]{6})$/i;
function parseHex(hex: string): number[] | null {
  const m = HEX.exec(hex.trim());
  return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null;
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const MAX_DIST = Math.sqrt(3 * 255 ** 2);

/** Filtros duros + puntuación. Devuelve solo las que cumplen todo, ya ordenadas. */
export function rankImages(items: ImageDescriptor[], q: ImageQuery): SearchHit[] {
  const target = q.dominantHex ? parseHex(q.dominantHex) : null;
  const maxDist = q.maxColorDistance ?? 0.2;
  const minShare = q.minColorShare ?? 15;
  const between = (v: number, lo?: number, hi?: number) => (lo === undefined || v >= lo) && (hi === undefined || v <= hi);

  const wantObj = q.hasObject ? norm(q.hasObject) : null;
  const wantObjSingular = wantObj?.replace(/(es|s)$/, '');
  const minObj = q.minObjectCount ?? 1;
  // Se compara por raíz (sin -s/-es final) para que 'perros' encuentre 'perro' y viceversa.
  const stem = (w: string) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w);
  const words = q.text ? norm(q.text).split(/\s+/).filter(Boolean).map(stem) : [];

  const hits: SearchHit[] = [];
  for (const d of items) {
    if (q.spatial && !matchesSpatial(d, q.spatial)) continue;
    if (q.orientation && d.metadata.orientation !== q.orientation) continue;
    if (q.hasTransparency !== undefined && d.metadata.hasTransparency !== q.hasTransparency) continue;
    if (q.temperature && d.colors.temperature !== q.temperature) continue;
    if (q.kind && d.kind?.type !== q.kind) continue;
    if (q.hasText !== undefined && (!d.text || (d.text.count > 0) !== q.hasText)) continue;
    if (!between(d.lighting.brightness, q.minBrightness, q.maxBrightness)) continue;
    if (!between(d.colors.saturation, q.minSaturation, q.maxSaturation)) continue;
    if (!between(d.geometry.edgeDensity, q.minEdgeDensity, q.maxEdgeDensity)) continue;

    if (q.minFaces !== undefined || q.maxFaces !== undefined || q.facePosition || q.minFaceArea !== undefined) {
      const f = d.faces;
      if (!f || !between(f.count, q.minFaces, q.maxFaces)) continue;
      if (q.facePosition && !f.items.some(i => i.position === q.facePosition)) continue;
      if (q.minFaceArea !== undefined && f.largestAreaRatio < q.minFaceArea) continue;
    }

    const scores: number[] = [];
    if (wantObj) {
      const o = d.objects;
      const matches = o?.items.filter(i => [norm(i.class), norm(i.label)].some(n => n === wantObj || n === wantObjSingular)) ?? [];
      if (matches.length < minObj) continue;
      scores.push(Math.max(...matches.map(m => m.score)));
    }
    if (words.length) {
      const hay = norm(`${d.caption ?? ''} ${(d.tags ?? []).join(' ')} ${d.text?.text ?? ''}`);
      if (!words.every(w => hay.includes(w))) continue;
    }
    if (q.colorName) {
      const share = d.colors.share[q.colorName] ?? 0;
      if (share < minShare) continue;
      scores.push(Math.min(1, share / 50));
    }
    if (target) {
      let best = Infinity;
      for (const c of d.colors.dominant) best = Math.min(best, Math.hypot(c.rgb.r - target[0], c.rgb.g - target[1], c.rgb.b - target[2]) / MAX_DIST);
      if (best > maxDist) continue;
      scores.push(1 - best / (maxDist || 1));
    }
    hits.push({ descriptor: d, score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1 });
  }

  const key: Record<NonNullable<ImageQuery['sortBy']>, (h: SearchHit) => number> = {
    relevance: h => h.score,
    brightness: h => h.descriptor.lighting.brightness,
    saturation: h => h.descriptor.colors.saturation,
    newest: h => Date.parse(h.descriptor.analyzedAt) || 0,
  };
  const k = key[q.sortBy ?? 'relevance'];
  return hits.sort((a, b) => k(b) - k(a));
}

export function searchImages(items: ImageDescriptor[], q: ImageQuery): ImageDescriptor[] {
  return rankImages(items, q).map(h => h.descriptor);
}
