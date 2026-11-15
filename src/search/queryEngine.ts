import type { ImageDescriptor, Orientation } from '../core/types';
export interface ImageQuery {
  orientation?: Orientation;
  minBrightness?: number; maxBrightness?: number;
  minSaturation?: number; maxSaturation?: number;
  minEdgeDensity?: number; maxEdgeDensity?: number;
  dominantHex?: string; maxColorDistance?: number;
}
function distance(a: string, b: string) {
  const parse = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const x = parse(a), y = parse(b);
  return Math.sqrt(x.reduce((sum, n, i) => sum + (n - y[i]) ** 2, 0)) / Math.sqrt(3 * 255 ** 2);
}
export function searchImages(items: ImageDescriptor[], q: ImageQuery) {
  return items.filter(x =>
    (!q.orientation || x.metadata.orientation === q.orientation) &&
    (q.minBrightness === undefined || x.lighting.brightness >= q.minBrightness) &&
    (q.maxBrightness === undefined || x.lighting.brightness <= q.maxBrightness) &&
    (q.minSaturation === undefined || x.colors.saturation >= q.minSaturation) &&
    (q.maxSaturation === undefined || x.colors.saturation <= q.maxSaturation) &&
    (q.minEdgeDensity === undefined || x.geometry.edgeDensity >= q.minEdgeDensity) &&
    (q.maxEdgeDensity === undefined || x.geometry.edgeDensity <= q.maxEdgeDensity) &&
    (!q.dominantHex || x.colors.dominant.some(c => distance(c.hex, q.dominantHex!) <= (q.maxColorDistance ?? 0.2)))
  );
}
