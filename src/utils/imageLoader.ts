import type { RawImage, SourceInfo } from '../core/types';

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function draw(bitmap: ImageBitmap, maxSide: number): { canvas: AnyCanvas; ctx: AnyContext } {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as AnyContext | null;
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function toBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo crear la miniatura'))), type, quality));
}

export interface Decoded { pixels: RawImage; source: SourceInfo; thumbnail: Blob }

/**
 * Decodifica un archivo sin tocar `document` ni `Image`, así que funciona
 * igual en el hilo principal y en un Web Worker. createImageBitmap aplica
 * la orientación EXIF por defecto.
 */
export async function decodeFile(file: File, maxSide = 512, thumbSide = 320): Promise<Decoded> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: no es una imagen.`);
  const bitmap = await createImageBitmap(file);
  try {
    const { ctx, canvas } = draw(bitmap, maxSide);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const thumb = draw(bitmap, thumbSide);
    const thumbnail = await toBlob(thumb.canvas, 'image/webp', 0.82);
    return {
      pixels: { width: pixels.width, height: pixels.height, data: pixels.data },
      source: { filename: file.name, bytes: file.size, mime: file.type, width: bitmap.width, height: bitmap.height },
      thumbnail,
    };
  } finally { bitmap.close(); }
}

/**
 * Solo píxeles, a otra resolución que el análisis base. El OCR necesita más detalle que 512 px
 * (texto pequeño) y, en imágenes diminutas, ampliar ayuda: `minSide` fija el lado mayor mínimo (ampliación máx. x4).
 */
export async function decodePixels(file: File, maxSide = 1280, minSide = 0): Promise<RawImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const target = longest > maxSide ? maxSide : longest < minSide ? Math.min(minSide, longest * 4) : longest;
    const scale = target / longest;
    const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as AnyContext | null;
    if (!ctx) throw new Error('Canvas 2D no disponible');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: px.width, height: px.height, data: px.data };
  } finally { bitmap.close(); }
}
