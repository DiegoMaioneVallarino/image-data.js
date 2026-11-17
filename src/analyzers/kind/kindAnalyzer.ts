import type { KindResult, RawImage } from '../../core/types';

const r4 = (v: number) => Number(v.toFixed(4));
const FLAT_TOL = 3;

/**
 * Tamaño de "píxel" de un pixel art ampliado con vecino más cercano: el mayor k (2..16) tal que
 * casi todas las rachas horizontales de color idéntico miden un múltiplo de k. 1 = no detectado.
 */
function detectBlockSize(img: RawImage): number {
  const { width: w, height: h, data } = img;
  const runs: number[] = [];
  for (let y = 0; y < h; y++) {
    let start = 0;
    for (let x = 1; x <= w; x++) {
      const same = x < w && data[(y * w + x) * 4] === data[(y * w + x - 1) * 4]
        && data[(y * w + x) * 4 + 1] === data[(y * w + x - 1) * 4 + 1] && data[(y * w + x) * 4 + 2] === data[(y * w + x - 1) * 4 + 2];
      if (!same) { if (start > 0 && x < w) runs.push(x - start); start = x; } // se descartan las rachas que tocan el borde
    }
  }
  if (runs.length < 50) return 1;
  for (let k = 16; k >= 2; k--) {
    let ok = 0;
    for (const r of runs) if (r % k === 0) ok++;
    if (ok / runs.length >= 0.95) return k;
  }
  return 1;
}

/**
 * Clasifica foto / gráfico (ilustración, vector, diagrama) / pixel art con heurísticas de píxeles:
 * una foto tiene miles de colores y casi ningún vecino idéntico; un gráfico concentra casi todo en pocos
 * colores y tiene grandes zonas planas; el pixel art además tiene paleta mínima y bloques regulares.
 * Es conservador a propósito: ante la duda devuelve 'photo' (preferible un falso positivo de objetos
 * en una ilustración rara que dejar sin análisis una foto con fondo blanco).
 */
export function analyzeKind(img: RawImage): KindResult {
  const { width: w, height: h, data } = img;
  const exact = new Set<number>();
  const bins = new Uint32Array(4096);
  let opaque = 0, transparent = 0, flat = 0, compared = 0;

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 128) { transparent++; continue; }
    opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (exact.size < 5000) exact.add((r << 16) | (g << 8) | b);
    bins[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]++;
    if (x + 1 < w && y + 1 < h) {
      const j = i + 4, k = i + w * 4;
      if (data[j + 3] >= 128 && data[k + 3] >= 128) {
        compared++;
        const dr = Math.abs(r - data[j]), dg = Math.abs(g - data[j + 1]), db = Math.abs(b - data[j + 2]);
        const er = Math.abs(r - data[k]), eg = Math.abs(g - data[k + 1]), eb = Math.abs(b - data[k + 2]);
        if (Math.max(dr, dg, db, er, eg, eb) <= FLAT_TOL) flat++;
      }
    }
  }

  const top16 = Array.from(bins).sort((a, b) => b - a).slice(0, 16).reduce((s, v) => s + v, 0);
  const top16Share = top16 / (opaque || 1), flatShare = flat / (compared || 1), distinct = exact.size;
  const transparentShare = transparent / (w * h || 1);
  const blockSize = distinct <= 256 ? detectBlockSize(img) : 1;

  let type: KindResult['type'] = 'photo';
  if (distinct <= 256 && top16Share >= 0.85 && (blockSize >= 2 || Math.max(w, h) <= 256)) type = 'pixel-art';
  else if ((top16Share >= 0.8 && flatShare >= 0.6) || (top16Share >= 0.75 && flatShare >= 0.5 && distinct <= 2000)) type = 'graphic';

  return { type, metrics: { distinctColors: distinct, top16Share: r4(top16Share), flatShare: r4(flatShare), blockSize, transparentShare: r4(transparentShare) } };
}
