import type { RGB, ColorSample } from '../../core/types';
export function analyzeColors(img: ImageData) {
  const { data } = img;
  const histogram = { r: Array(16).fill(0) as number[], g: Array(16).fill(0) as number[], b: Array(16).fill(0) as number[] };
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  let r = 0, g = 0, b = 0, saturation = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const R = data[i], G = data[i + 1], B = data[i + 2];
    r += R; g += G; b += B; n++;
    histogram.r[R >> 4]++; histogram.g[G >> 4]++; histogram.b[B >> 4]++;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    saturation += max === 0 ? 0 : (max - min) / max;
    const key = `${R >> 5},${G >> 5},${B >> 5}`;
    const item = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    item.count++; item.r += R; item.g += G; item.b += B; buckets.set(key, item);
  }
  const rgb = (R: number, G: number, B: number): RGB => ({ r: Math.round(R), g: Math.round(G), b: Math.round(B) });
  const hex = ({ r, g, b }: RGB) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  const dominant: ColorSample[] = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 6)
    .map(v => { const color = rgb(v.r / v.count, v.g / v.count, v.b / v.count); return { hex: hex(color), rgb: color, percent: Number((100 * v.count / (n || 1)).toFixed(2)) }; });
  return { average: rgb(r / (n || 1), g / (n || 1), b / (n || 1)), dominant, histogram, saturation: Number((saturation / (n || 1)).toFixed(4)) };
}
