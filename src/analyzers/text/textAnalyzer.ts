import type { RawImage, TextLine, TextResult } from '../../core/types';
import { verifyOcrPasses } from './verifyOcr';
import { TimeoutError, withTimeout } from '../../utils/async';

export const TEXT_ENGINE = 'tesseract.js';

export interface TextOptions {
  /** Idiomas de Tesseract unidos con '+'. Por defecto 'eng+spa'. */
  languages?: string;
  /** Verifica líneas con una segunda lectura en escala de grises. Reduce falsos positivos, puede omitir texto difícil. */
  verification?: 'off' | 'conservative';
  /** Confianza mínima por palabra (0..100). Por defecto 70. En fotos se exige al menos 80. */
  minConfidence?: number;
  /** Palabras plausibles mínimas para aceptar que hay texto; con menos se devuelve count 0. Por defecto 2 (3 en fotos). */
  minWords?: number;
  /** Máx. ms para cargar Tesseract y los idiomas (descarga incluida). Por defecto 90000. Al vencer, el OCR queda desactivado el resto de la sesión. */
  loadTimeoutMs?: number;
  /** Máx. ms para leer una imagen. Por defecto 60000. Al vencer se reinicia el motor para la siguiente. */
  timeoutMs?: number;
  /** Si true, no se lee texto en fotos (donde Tesseract más inventa). Por defecto false. */
  skipPhotos?: boolean;
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
const edge = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Filtro anti-basura. Tesseract siempre intenta leer algo en cualquier textura y devuelve "palabras" como
 * 'Ee', 'iii', 'xkqz' o 'aBcDe' con confianza media; aquí se descarta lo que no parece una palabra real.
 */
export function isPlausibleWord(raw: string): boolean {
  const t = raw.replace(edge, '');
  if (!t) return false;
  const chars = [...t];
  if (chars.filter(c => /[\p{L}\p{N}]/u.test(c)).length / chars.length < 0.7) return false; // demasiados símbolos
  if (/^\p{N}+$/u.test(t)) return chars.length >= 2;                                         // números: sí, de 1 dígito no
  if (chars.length < 2) return false;                                                       // letras sueltas: casi siempre ruido
  const low = chars.map(c => c.toLowerCase());
  if (low.every(c => c === low[0])) return false;                                           // 'iii', 'ooo', 'Ee'
  if (chars.length <= 3 && /^[Il1|!]+$/.test(t)) return false;                              // trazos verticales leídos como 'Il', 'lI1'
  if (/^\p{Script=Latin}+$/u.test(t)) {
    if (chars.length >= 3 && !/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/u.test(t) && t !== t.toUpperCase()) return false; // sin vocales (siglas en mayúsculas sí)
    let flips = 0;                                                                          // 'aBcDe': alternancia caótica de mayúsculas
    for (let i = 1; i < chars.length; i++) if ((chars[i] === chars[i].toUpperCase()) !== (chars[i - 1] === chars[i - 1].toUpperCase()) && /\p{L}/u.test(chars[i] + chars[i - 1])) flips++;
    if (flips >= 3) return false;
  }
  return true;
}

export interface DecodeTextOptions { minConfidence?: number; minWords?: number }

/**
 * Convierte la salida de Tesseract en un TextResult: descarta palabras poco fiables o implausibles,
 * reconstruye cada línea solo con las que sobreviven y, si en total quedan menos de `minWords`,
 * declara que no hay texto (un par de palabras sueltas en una foto casi siempre es ruido).
 * Pura: se prueba sin cargar Tesseract.
 */
export function decodeText(blocks: TBlock[] | null | undefined, size: { width: number; height: number }, languages: string, opts: DecodeTextOptions = {}): TextResult {
  const { minConfidence = 70, minWords = 2 } = opts;
  const lines: TextLine[] = [];
  let words = 0, area = 0, seen = 0;
  for (const b of blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    seen += (l.words ?? []).length;
    const kept = (l.words ?? []).filter(w => w.confidence >= minConfidence && isPlausibleWord(w.text));
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
  if (words < minWords) return { engine: TEXT_ENGINE, languages, count: 0, discarded: seen, text: '', coverage: 0, lines: [] };
  return { engine: TEXT_ENGINE, languages, count: words, discarded: seen - words, text: lines.map(l => l.text).join('\n'), coverage: r4(Math.min(1, area / (size.width * size.height || 1))), lines };
}

export interface ReadOptions {
  /** Modo estricto para fotos: confianza >= 80 y al menos 3 palabras plausibles. */
  strict?: boolean;
}
export interface TextReader { read(img: RawImage, opts?: ReadOptions): Promise<TextResult>; dispose(): Promise<void> }

export async function createTextReader(opts: TextOptions = {}): Promise<TextReader> {
  const languages = opts.languages ?? 'eng+spa';
  const loadMs = opts.loadTimeoutMs ?? 90_000, readMs = opts.timeoutMs ?? 60_000;
  const loadMsg = `Tesseract no cargó en ${Math.round(loadMs / 1000)} s (¿sin internet? ver models/README.md para usarlo sin conexión)`;
  const paths: Record<string, unknown> = {};
  if (opts.workerPath) paths.workerPath = opts.workerPath;
  if (opts.corePath) paths.corePath = opts.corePath;
  if (opts.langPath) paths.langPath = opts.langPath;
  const worker = await withTimeout((async () => {
    const { createWorker } = (await import('tesseract.js')) as unknown as TModule;
    return createWorker(languages, 1, paths);
  })(), loadMs, loadMsg);
  return {
    async read(img, ro = {}) {
      const { data } = await withTimeout(worker.recognize(toCanvas(img), {}, { blocks: true }), readMs, `El OCR tardó más de ${Math.round(readMs / 1000)} s en una imagen`);
      const minConfidence = Math.max(opts.minConfidence ?? 70, ro.strict ? 80 : 0);
      const minWords = Math.max(opts.minWords ?? 2, ro.strict ? 3 : 0);
      const first = decodeText(data.blocks, img, languages, { minConfidence, minWords });
      if ((opts.verification ?? 'conservative') === 'off' || first.count === 0) return first;
      // Segundo pase sobre el mismo lienzo en escala de grises, sin alterar coordenadas.
      const gray = new Uint8ClampedArray(img.data);
      for (let i = 0; i < gray.length; i += 4) {
        const y = Math.round(0.299 * gray[i] + 0.587 * gray[i + 1] + 0.114 * gray[i + 2]);
        gray[i] = gray[i + 1] = gray[i + 2] = y;
      }
      const secondImage = { ...img, data: gray };
      const { data: secondData } = await withTimeout(worker.recognize(toCanvas(secondImage), {}, { blocks: true }), readMs, 'Segundo pase OCR agotado');
      const second = decodeText(secondData.blocks, img, languages, { minConfidence, minWords: 1 });
      return verifyOcrPasses(first, second);
    },
    async dispose() { await worker.terminate(); },
  };
}

// Un lector por configuración. Si la CARGA falla o se agota se recuerda el error (no se reintenta por cada imagen,
// así una descarga colgada no multiplica la espera). Si una LECTURA se agota, el motor se descarta y se recrea.
const cache = new Map<string, Promise<TextReader>>();
export function getTextReader(opts: TextOptions = {}): Promise<TextReader> {
  const key = JSON.stringify([opts.languages, opts.workerPath, opts.corePath, opts.langPath]);
  let p = cache.get(key);
  if (!p) {
    p = createTextReader(opts).then((reader): TextReader => ({
      async read(img, ro) {
        try { return await reader.read(img, ro); }
        catch (e) {
          if (e instanceof TimeoutError) { cache.delete(key); void reader.dispose().catch(() => undefined); }
          throw e;
        }
      },
      dispose: () => reader.dispose(),
    }));
    cache.set(key, p);
  }
  return p;
}
