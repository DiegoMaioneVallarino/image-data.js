import { analyzeFile, type Analyzed, type AnalyzeOptions } from './analyzer';

export interface BatchOptions extends AnalyzeOptions {
  onProgress?: (done: number, total: number) => void;
  /** Workers en paralelo. Por defecto min(4, núcleos - 1), mínimo 1. */
  concurrency?: number;
  /** false fuerza el análisis en el hilo principal. */
  useWorker?: boolean;
}
export interface BatchResult { ok: Analyzed[]; failed: { file: File; error: string }[]; /** Avisos de módulos opcionales, sin repetir */ warnings: string[] }

type WorkerReply = { ok: true; result: Analyzed } | { ok: false; error: string };
class WorkerUnavailable extends Error {}

function createWorker(): Worker | null {
  try { return new Worker(new URL('./analyzer.worker.ts', import.meta.url), { type: 'module' }); }
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

  const wanted = opts.concurrency ?? Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 1));
  const size = Math.max(1, Math.min(wanted, total));
  const workers: (Worker | null)[] = [];
  for (let i = 0; i < size; i++) workers.push(opts.useWorker === false || typeof Worker === 'undefined' ? null : createWorker());

  async function lane(worker: Worker | null) {
    while (next < total) {
      const i = next++;
      try {
        if (worker) {
          try { slots[i] = await runInWorker(worker, files[i], opts); }
          catch (e) {
            if (!(e instanceof WorkerUnavailable)) throw e;
            worker.terminate(); worker = null;
            slots[i] = await analyzeFile(files[i], opts);
          }
        } else slots[i] = await analyzeFile(files[i], opts);
      } catch (e) { slots[i] = { error: e instanceof Error ? e.message : String(e) }; }
      opts.onProgress?.(++done, total);
    }
  }

  try { await Promise.all(workers.map(lane)); }
  finally { workers.forEach(w => w?.terminate()); }

  const result: BatchResult = { ok: [], failed: [], warnings: [] };
  slots.forEach((s, i) => { if (s && 'error' in s) result.failed.push({ file: files[i], error: s.error }); else if (s) result.ok.push(s); });
  result.warnings = [...new Set(result.ok.flatMap(a => a.warnings))];
  return result;
}
