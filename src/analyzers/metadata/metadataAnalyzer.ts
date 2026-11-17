import type { Orientation, RawImage, SourceInfo } from '../../core/types';

/** Dimensiones y mime vienen del archivo original; la transparencia, de los píxeles. */
export function analyzeMetadata(src: SourceInfo, pixels: RawImage) {
  const { width, height } = src;
  const ratio = width / height;
  const orientation: Orientation = ratio > 1.05 ? 'landscape' : ratio < 0.95 ? 'portrait' : 'square';
  let hasTransparency = false;
  for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] < 250) { hasTransparency = true; break; }
  return { width, height, aspectRatio: Number(ratio.toFixed(4)), orientation, bytes: src.bytes, mime: src.mime, hasTransparency };
}
