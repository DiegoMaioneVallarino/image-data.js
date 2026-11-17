import type { RawImage } from '../../core/types';

export function analyzeLighting(img: RawImage) {
  const { data } = img;
  let sum = 0, squares = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const y = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    sum += y; squares += y * y; n++;
  }
  const mean = sum / (n || 1);
  return { brightness: Number(mean.toFixed(4)), contrast: Number(Math.sqrt(Math.max(0, squares / (n || 1) - mean * mean)).toFixed(4)) };
}
