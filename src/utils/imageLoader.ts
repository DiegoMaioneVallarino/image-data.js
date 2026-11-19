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

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', png: 'image/png', apng: 'image/png',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml',
  tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
};
/**
 * MIME del archivo. Los navegadores dejan `type` vacío (o 'application/octet-stream') en formatos que el sistema
 * no conoce (.avif, .jfif…): en ese caso se deduce de la extensión. createImageBitmap detecta el formato por contenido.
 */
export function guessMime(file: { name: string; type: string }): string {
  if (file.type.startsWith('image/')) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? file.type;
}
export const isImageFile = (file: { name: string; type: string }) => guessMime(file).startsWith('image/');
export const isSvg = (file: { name: string; type: string }) => guessMime(file) === 'image/svg+xml';

/**
 * createImageBitmap no decodifica SVG, así que se rasteriza con <img> + canvas (solo hilo principal).
 * Al ser vectorial se dibuja a `maxSide` aunque el SVG declare un tamaño menor. El resultado conserva el
 * nombre del archivo pero es un PNG (el `mime` del descriptor será image/png).
 */
export async function rasterizeSvg(file: File, maxSide = 1024): Promise<File> {
  if (typeof document === 'undefined') throw new Error(`${file.name}: los SVG solo se pueden rasterizar en el hilo principal.`);
  const url = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error(`${file.name}: SVG inválido o con recursos externos que no se pueden cargar.`); }
    const nw = img.naturalWidth || 1024, nh = img.naturalHeight || 1024;
    const scale = maxSide / Math.max(nw, nh);
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(nw * scale)), height: Math.max(1, Math.round(nh * scale)) });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error(`${file.name}: no se pudo rasterizar el SVG`))), 'image/png'));
    return new File([blob], file.name, { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}

/** Deja el archivo listo para decodificar: hoy solo rasteriza SVG. No-op para el resto. */
export async function prepareFile(file: File): Promise<File> {
  return isSvg(file) ? rasterizeSvg(file) : file;
}

export interface Decoded { pixels: RawImage; source: SourceInfo; thumbnail: Blob }

/**
 * Decodifica un archivo sin tocar `document` ni `Image`, así que funciona
 * igual en el hilo principal y en un Web Worker. createImageBitmap aplica
 * la orientación EXIF por defecto.
 */
export async function decodeFile(file: File, maxSide = 512, thumbSide = 320): Promise<Decoded> {
  if (!isImageFile(file)) throw new Error(`${file.name}: no es una imagen reconocida.`);
  if (isSvg(file)) throw new Error(`${file.name}: un SVG debe pasar antes por prepareFile().`);
  const bitmap = await createImageBitmap(file);
  try {
    const { ctx, canvas } = draw(bitmap, maxSide);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const thumb = draw(bitmap, thumbSide);
    const thumbnail = await toBlob(thumb.canvas, 'image/webp', 0.82);
    return {
      pixels: { width: pixels.width, height: pixels.height, data: pixels.data },
      source: { filename: file.name, bytes: file.size, mime: guessMime(file), width: bitmap.width, height: bitmap.height },
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
