import type { FaceItem, FacesResult, RawImage, RegionName } from '../../core/types';
import { fetchModel, loadOrt, type OrtOptions, type OrtSession, type OrtModule } from '../../models/ort';

// Ultra-Light-Fast-Generic-Face-Detector (version-RFB-320), licencia MIT.
export const FACE_MODEL_ID = 'ultraface-rfb-320';
export const INPUT_W = 320;
export const INPUT_H = 240;

export interface FaceOptions extends OrtOptions {
  /** URL del .onnx, p. ej. '/models/version-RFB-320.onnx' */
  modelUrl: string;
  /** Confianza mínima (0..1). Por defecto 0.7. */
  minScore?: number;
  /** IoU a partir del cual dos cajas se consideran el mismo rostro. Por defecto 0.4. */
  nmsIou?: number;
}

/** Redimensiona (bilineal, estirando como en el entrenamiento) y devuelve tensor CHW RGB normalizado: (v-127)/128. */
export function preprocess(img: RawImage): Float32Array {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(3 * INPUT_H * INPUT_W);
  const plane = INPUT_H * INPUT_W;
  for (let y = 0; y < INPUT_H; y++) {
    const sy = Math.min(h - 1, Math.max(0, (y + 0.5) * h / INPUT_H - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < INPUT_W; x++) {
      const sx = Math.min(w - 1, Math.max(0, (x + 0.5) * w / INPUT_W - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
      const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[i00 + c] * (1 - fx) * (1 - fy) + data[i10 + c] * fx * (1 - fy) + data[i01 + c] * (1 - fx) * fy + data[i11 + c] * fx * fy;
        out[c * plane + y * INPUT_W + x] = (v - 127) / 128;
      }
    }
  }
  return out;
}

interface Candidate { x1: number; y1: number; x2: number; y2: number; score: number }
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function iou(a: Candidate, b: Candidate): number {
  const iw = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), ih = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  return inter / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter);
}

const NAMES: RegionName[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export function regionOf(cx: number, cy: number): RegionName {
  return NAMES[Math.min(2, Math.floor(clamp01(cy) * 3)) * 3 + Math.min(2, Math.floor(clamp01(cx) * 3))];
}

/**
 * Salidas del modelo: scores [1,N,2] (fondo, rostro; ya con softmax) y boxes [1,N,4]
 * como esquinas normalizadas [x1,y1,x2,y2]. Filtra por confianza y aplica NMS.
 */
export function decodeFaces(scores: ArrayLike<number>, boxes: ArrayLike<number>, minScore = 0.7, nmsIou = 0.4): FacesResult {
  const n = Math.floor(scores.length / 2);
  const cands: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const score = scores[i * 2 + 1];
    if (!(score >= minScore)) continue;
    const c = { x1: clamp01(boxes[i * 4]), y1: clamp01(boxes[i * 4 + 1]), x2: clamp01(boxes[i * 4 + 2]), y2: clamp01(boxes[i * 4 + 3]), score };
    if (c.x2 > c.x1 && c.y2 > c.y1) cands.push(c);
  }
  cands.sort((a, b) => b.score - a.score);
  const kept: Candidate[] = [];
  for (const c of cands) if (kept.every(k => iou(k, c) < nmsIou)) kept.push(c);

  const items: FaceItem[] = kept.map(c => {
    const w = c.x2 - c.x1, h = c.y2 - c.y1;
    return {
      box: { x: Number(c.x1.toFixed(4)), y: Number(c.y1.toFixed(4)), w: Number(w.toFixed(4)), h: Number(h.toFixed(4)) },
      score: Number(c.score.toFixed(4)), areaRatio: Number((w * h).toFixed(4)), position: regionOf(c.x1 + w / 2, c.y1 + h / 2),
    };
  });
  return { model: FACE_MODEL_ID, count: items.length, largestAreaRatio: items.reduce((m, f) => Math.max(m, f.areaRatio), 0), items };
}

export interface FaceDetector { detect(img: RawImage): Promise<FacesResult> }

export async function createFaceDetector(opts: FaceOptions): Promise<FaceDetector> {
  const ort: OrtModule = await loadOrt(opts);
  const session: OrtSession = await ort.InferenceSession.create(await fetchModel(opts.modelUrl), { executionProviders: ['wasm'] });
  const input = session.inputNames[0];
  return {
    async detect(img) {
      const feeds = { [input]: new ort.Tensor('float32', preprocess(img), [1, 3, INPUT_H, INPUT_W]) };
      const out = await session.run(feeds);
      // Se identifican por la última dimensión (2 = scores, 4 = boxes) en vez de por nombre.
      const all = Object.values(out);
      const scores = all.find(t => t.dims[t.dims.length - 1] === 2);
      const boxes = all.find(t => t.dims[t.dims.length - 1] === 4);
      if (!scores || !boxes) throw new Error('Salidas inesperadas: ¿es el modelo version-RFB-320?');
      return decodeFaces(scores.data, boxes.data, opts.minScore, opts.nmsIou);
    },
  };
}

// Un detector por modelUrl; si la carga falla se recuerda el error para no reintentar por cada imagen.
const cache = new Map<string, Promise<FaceDetector>>();
export function getFaceDetector(opts: FaceOptions): Promise<FaceDetector> {
  let p = cache.get(opts.modelUrl);
  if (!p) { p = createFaceDetector(opts); cache.set(opts.modelUrl, p); }
  return p;
}
