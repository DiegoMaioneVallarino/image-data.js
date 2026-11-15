import type { RGB, Region } from '../../core/types';
export function analyzeGeometry(img: ImageData) {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = data[j + 3] < 128 ? 0 : 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
  }
  const names = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const regions: Region[] = [];
  let totalEdges = 0, totalCompared = 0;
  for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 3; rx++) {
    const x0 = Math.floor(rx * w / 3), x1 = Math.floor((rx + 1) * w / 3);
    const y0 = Math.floor(ry * h / 3), y1 = Math.floor((ry + 1) * h / 3);
    let r = 0, g = 0, b = 0, bright = 0, n = 0, edges = 0, compared = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = y * w + x, j = k * 4;
      if (data[j + 3] < 128) continue;
      r += data[j]; g += data[j + 1]; b += data[j + 2]; bright += gray[k]; n++;
      if (x + 1 < x1 && y + 1 < y1 && data[j + 7] >= 128 && data[j + w * 4 + 3] >= 128) {
        if (Math.abs(gray[k] - gray[k + 1]) + Math.abs(gray[k] - gray[k + w]) > 65) edges++;
        compared++;
      }
    }
    const average: RGB = { r: Math.round(r / (n || 1)), g: Math.round(g / (n || 1)), b: Math.round(b / (n || 1)) };
    regions.push({ name: names[ry * 3 + rx], average, brightness: Number((bright / (255 * (n || 1))).toFixed(4)), edgeDensity: Number((edges / (compared || 1)).toFixed(4)) });
    totalEdges += edges; totalCompared += compared;
  }
  return { edgeDensity: Number((totalEdges / (totalCompared || 1)).toFixed(4)), regions };
}
