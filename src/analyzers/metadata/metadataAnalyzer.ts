import type { Orientation } from '../../core/types';
export function analyzeMetadata(file: File, image: HTMLImageElement) {
  const width = image.naturalWidth, height = image.naturalHeight;
  const ratio = width / height;
  const orientation: Orientation = ratio > 1.05 ? 'landscape' : ratio < 0.95 ? 'portrait' : 'square';
  return { width, height, aspectRatio: Number(ratio.toFixed(4)), orientation, bytes: file.size, mime: file.type };
}
