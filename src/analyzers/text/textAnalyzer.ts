import type { RawImage, TextLine, TextResult } from '../../core/types';

export const TEXT_ENGINE = 'tesseract.js';

export interface TextOptions {
  /** Idiomas de Tesseract unidos con '+'. Por defecto 'eng+spa'. */
  languages?: string;
  /** Confianza mínima por palabra (0..100). Por defecto 60; sube si ves texto basura en fotos. */
  minConfidence?: number;
  /** Lado mayor con que se lee la imagen (independiente del análisis base de 512 px). Por defecto 1280. */
  maxSide?: number;
  /** Si el lado mayor es menor que esto se amplía (máx. x4). Por defecto 640. */
  minSide?: number;
  /** Rutas propias para trabajar sin internet; por defecto Tesseract usa su CDN. */
  workerPath?: string; corePath?: string; langPath?: string;
}

// Superficie mínima de tesseract.js que usamos (v6/v7: hay que pedir `blocks` explícitamente).
interface TBox { x0: number; y0: number; x1: number; y1: number }
interface TWord { text: string; confidence: number; bbox: TBox }
interface TLine { words?: TWord[] }
interface TBlock { paragraphs?: { lines?: TLine[] }[] }
interface TWorker {
  recognize(image: unknown, options?: object, output?: { blocks?: boolean }): Promise<{ data: { blocks?: TBlock[] | null } }>;
  terminate(): Promise<unknown>;
}
interface TModule { createWorker(langs: string, oem?: number, options?: Record<string, unknown>): Promise<TWorker> }

type Canvas = OffscreenCanvas | HTMLCanvasElement;
function toCanvas(img: RawImage): Canvas {
  const canvas: Canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.width, img.height) : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

const r4 = (v: number) => Number(v.toFixed(4));
const HAS_CONTENT = /[\p{L}\p{N}]/u;

/**
 * Convierte la salida de Tesseract en un TextResult: descarta palabras poco fiables o sin letras/números
 * y reconstruye cada línea solo con las palabras que sobreviven. Pura: se prueba sin cargar Tesseract.
 */
export function decodeText(blocks: TBlock[] | null | undefined, size: { width: number; height: number }, languages: string, minConfidence = 60): TextResult {
  const lines: TextLine[] = [];
  let words = 0, area = 0;
  for (const b of blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    const kept = (l.words ?? []).filter(w => w.confidence >= minConfidence && HAS_CONTENT.test(w.text));
    if (!kept.length) continue;
    const x0 = Math.min(...kept.map(w => w.bbox.x0)), y0 = Math.min(...kept.map(w => w.bbox.y0));
    const x1 = Math.max(...kept.map(w => w.bbox.x1)), y1 = Math.max(...kept.map(w => w.bbox.y1));
    words += kept.length;
    for (const w of kept) area += Math.max(0, w.bbox.x1 - w.bbox.x0) * Math.max(0, w.bbox.y1 - w.bbox.y0);
    lines.push({
      text: kept.map(w => w.text).join(' '),
      confidence: Number((kept.reduce((s, w) => s + w.confidence, 0) / kept.length).toFixed(1)),
      box: { x: r4(x0 / size.width), y: r4(y0 / size.height), w: r4((x1 - x0) / size.width), h: r4((y1 - y0) / size.height) },
    });
  }
  return { engine: TEXT_ENGINE, languages, count: words, text: lines.map(l => l.text).join('\n'), coverage: r4(Math.min(1, area / (size.width * size.height || 1))), lines };
}

export interface TextReader { read(img: RawImage): Promise<TextResult> }

export async function createTextReader(opts: TextOptions = {}): Promise<TextReader> {
  const languages = opts.languages ?? 'eng+spa';
  const { createWorker } = (await import('tesseract.js')) as unknown as TModule;
  const paths: Record<string, unknown> = {};
  if (opts.workerPath) paths.workerPath = opts.workerPath;
  if (opts.corePath) paths.corePath = opts.corePath;
  if (opts.langPath) paths.langPath = opts.langPath;
  const worker = await createWorker(languages, 1, paths);
  return {
    async read(img) {
      const { data } = await worker.recognize(toCanvas(img), {}, { blocks: true });
      return decodeText(data.blocks, img, languages, opts.minConfidence);
    },
  };
}

// Un lector por configuración. Si la carga falla se recuerda el error para no reintentar por cada imagen.
const cache = new Map<string, Promise<TextReader>>();
export function getTextReader(opts: TextOptions = {}): Promise<TextReader> {
  const key = JSON.stringify([opts.languages, opts.workerPath, opts.corePath, opts.langPath]);
  let p = cache.get(key);
  if (!p) { p = createTextReader(opts); cache.set(key, p); }
  return p;
}
