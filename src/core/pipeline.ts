import { analyzeFile, type Analyzed, type AnalyzeOptions } from './analyzer';
import { prepareFile } from '../utils/imageLoader';
import { TimeoutError, withTimeout } from '../utils/async';

export interface BatchOptions extends AnalyzeOptions {
  onProgress?: (done: number, total: number) => void;
  /** Workers en paralelo. Por defecto min(4, núcleos - 1), mínimo 1; con OCR activo, máx. 2 (cada worker carga su propio Tesseract). */
  concurrency?: number;
  /** false fuerza el análisis en el hilo principal. */
  useWorker?: boolean;
  /** Tiempo máximo por imagen en ms antes de darla por fallida y seguir con la siguiente. Por defecto 120000; 0 = sin límite. */
  timeoutMs?: number;
}
export interface BatchResult { ok: Analyzed[]; failed: { file: File; error: string }[]; /** Avisos de módulos opcionales, sin repetir */ warnings: string[] }

type WorkerReply = { ok: true; result: Analyzed } | { ok: false; error: string };
class WorkerUnavailable extends Error {}

function createWorker(live: Set<Worker>): Worker | null {
  try { const w = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' }); live.add(w); return w; }
  catch { return null; }
}

function runInWorker(worker: Worker, file: File, opts: AnalyzeOptions): Promise<Analyzed> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker.onmessage = null; worker.onerror = null; };
    worker.onmessage = (e: MessageEvent<WorkerReply>) => { cleanup(); e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error)); };
    worker.onerror = e => { cleanup(); reject(new WorkerUnavailable(e.message || 'Worker caído')); };
    // Se reenvía todo salvo funciones (onProgress no es clonable): una opción nueva no se pierde por olvido.
    const analyze = Object.fromEntries(Object.entries(opts).filter(([, v]) => typeof v !== 'function'));
    worker.postMessage({ file, ...analyze });
  });
}

/**
 * Analiza en lote. Un archivo defectuoso no aborta el resto: queda en `failed`.
 * Si el navegador no permite workers, cae al hilo principal de forma transparente.
 */
export async function analyzeBatch(files: File[], opts: BatchOptions = {}): Promise<BatchResult> {
  const total = files.length;
  const slots: (Analyzed | { error: string } | undefined)[] = new Array(total);
  let next = 0, done = 0;

  const wanted = opts.concurrency ?? Math.max(1, Math.min(opts.text ? 2 : 4, (navigator.hardwareConcurrency ?? 2) - 1));
  const size = Math.max(1, Math.min(wanted, total));
  const live = new Set<Worker>(); // workers de ESTE lote (incluye reemplazos)
  const spawn = () => (opts.useWorker === false || typeof Worker === 'undefined' ? null : createWorker(live));
  const workers: (Worker | null)[] = [];
  for (let i = 0; i < size; i++) workers.push(spawn());

  const timeoutMs = opts.timeoutMs ?? 120_000;

  async function lane(worker: Worker | null) {
    while (next < total) {
      const i = next++;
      try {
        // Los SVG se rasterizan aquí (hilo principal): los workers no tienen DOM.
        const file = await prepareFile(files[i]);
        const timeoutMsg = `${files[i].name}: tiempo agotado (${Math.round(timeoutMs / 1000)} s); se omitió y se continúa con las demás.`;
        if (worker) {
          try { slots[i] = await withTimeout(runInWorker(worker, file, opts), timeoutMs, timeoutMsg); }
          catch (e) {
            if (e instanceof TimeoutError) { worker.terminate(); live.delete(worker); worker = spawn(); throw e; } // el worker quedó colgado: se reemplaza
            if (!(e instanceof WorkerUnavailable)) throw e;
            worker.terminate(); live.delete(worker); worker = null;
            slots[i] = await withTimeout(analyzeFile(file, opts), timeoutMs, timeoutMsg);
          }
        } else slots[i] = await withTimeout(analyzeFile(file, opts), timeoutMs, timeoutMsg);
      } catch (e) { slots[i] = { error: e instanceof Error ? e.message : String(e) }; }
      opts.onProgress?.(++done, total);
    }
  }

  try { await Promise.all(workers.map(lane)); }
  finally { live.forEach(w => w.terminate()); live.clear(); }

  const result: BatchResult = { ok: [], failed: [], warnings: [] };
  slots.forEach((s, i) => { if (s && 'error' in s) result.failed.push({ file: files[i], error: s.error }); else if (s) result.ok.push(s); });
  result.warnings = [...new Set(result.ok.flatMap(a => a.warnings))];
  return result;
}
