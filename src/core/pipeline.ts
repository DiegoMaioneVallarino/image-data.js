import { analyzeImage } from './analyzer';
export async function analyzeBatch(files: File[], onProgress?: (done: number, total: number) => void) {
  const results = [];
  for (const file of files) {
    results.push(await analyzeImage(file));
    onProgress?.(results.length, files.length);
  }
  return results;
}
