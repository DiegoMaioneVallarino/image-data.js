import type { ColorName, ColorSample, RGB, RawImage, Temperature } from '../../core/types';

const CHROMA_GRAY = 0.08;
const MIN_PALETTE_DISTANCE = 48; // distancia RGB (0..441) mínima entre colores de la paleta

/** Matiz en grados, luminosidad HSL y croma, todo en un solo paso. */
function hueLightChroma(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 510;
  if (d === 0) return [0, l, 0];
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, l, d / 255];
}

export function nameFromHLC(h: number, l: number, c: number): ColorName {
  if (l < 0.12) return 'black';
  if (l > 0.92) return 'white';
  if (c < CHROMA_GRAY) return 'gray';
  if (h < 15 || h >= 345) return l < 0.35 ? 'brown' : 'red';
  if (h < 45) return l < 0.45 ? 'brown' : 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'cyan';
  if (h < 260) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

export function nameColor(r: number, g: number, b: number): ColorName {
  return nameFromHLC(...hueLightChroma(r, g, b));
}

const hex = ({ r, g, b }: RGB) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

export function analyzeColors(img: RawImage) {
  const { data } = img;
  const histogram = { r: Array(16).fill(0) as number[], g: Array(16).fill(0) as number[], b: Array(16).fill(0) as number[] };
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const names = new Map<ColorName, number>();
  let r = 0, g = 0, b = 0, chroma = 0, warm = 0, cool = 0, n = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const R = data[i], G = data[i + 1], B = data[i + 2];
    r += R; g += G; b += B; n++;
    histogram.r[R >> 4]++; histogram.g[G >> 4]++; histogram.b[B >> 4]++;
    const [h, l, c] = hueLightChroma(R, G, B);
    chroma += c;
    const nm = nameFromHLC(h, l, c);
    names.set(nm, (names.get(nm) ?? 0) + 1);
    if (c > 0.12 && l > 0.1 && l < 0.92) {
      if (h < 70 || h >= 330) warm++; else if (h >= 150 && h < 270) cool++;
    }
    const key = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4);
    const item = buckets.get(key);
    if (item) { item.count++; item.r += R; item.g += G; item.b += B; }
    else buckets.set(key, { count: 1, r: R, g: G, b: B });
  }

  const total = n || 1;
  const rgb = (R: number, G: number, B: number): RGB => ({ r: Math.round(R), g: Math.round(G), b: Math.round(B) });

  // Paleta: se recorren los cubos de mayor a menor y se descartan los cercanos a uno ya elegido.
  // El peso de un descartado se suma al elegido que lo absorbe, para que los porcentajes sigan siendo reales.
  const sorted = [...buckets.values()].sort((a, c) => c.count - a.count)
    .map(v => ({ color: rgb(v.r / v.count, v.g / v.count, v.b / v.count), count: v.count }));
  const picked: { color: RGB; count: number }[] = [];
  for (const s of sorted) {
    let nearest: { color: RGB; count: number } | undefined, best = Infinity;
    for (const p of picked) {
      const d = Math.hypot(p.color.r - s.color.r, p.color.g - s.color.g, p.color.b - s.color.b);
      if (d < best) { best = d; nearest = p; }
    }
    if (nearest && best <= MIN_PALETTE_DISTANCE) nearest.count += s.count;
    else picked.push({ ...s });
  }
  const dominant: ColorSample[] = picked.sort((a, c) => c.count - a.count).slice(0, 6)
    .map(p => ({ hex: hex(p.color), rgb: p.color, name: nameColor(p.color.r, p.color.g, p.color.b), percent: Number((100 * p.count / total).toFixed(2)) }));

  const share: Partial<Record<ColorName, number>> = {};
  let dominantName: ColorName = 'gray', top = -1;
  for (const [nm, count] of names) {
    share[nm] = Number((100 * count / total).toFixed(2));
    if (count > top) { top = count; dominantName = nm; }
  }

  const tinted = warm + cool;
  const temperature: Temperature = tinted < total * 0.05 ? 'neutral' : warm > cool * 1.3 ? 'warm' : cool > warm * 1.3 ? 'cool' : 'neutral';

  return {
    average: rgb(r / total, g / total, b / total),
    dominant, dominantName, share, histogram,
    saturation: Number((chroma / total).toFixed(4)),
    temperature,
  };
}
