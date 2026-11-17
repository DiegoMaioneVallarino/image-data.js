import { analyzeFile, type AnalyzeOptions } from './analyzer';

// Tipado mínimo para no requerir la lib "webworker" en tsconfig.
const ctx = self as unknown as { postMessage(message: unknown): void; onmessage: ((e: MessageEvent<{ file: File } & AnalyzeOptions>) => void) | null };

ctx.onmessage = async e => {
  // Todo lo que no sea `file` son opciones de análisis: así una opción nueva no se pierde al pasar por el worker.
  const { file, ...opts } = e.data;
  try { ctx.postMessage({ ok: true, result: await analyzeFile(file, opts) }); }
  catch (err) { ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
};
