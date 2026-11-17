/** Superficie mínima de onnxruntime-web que usamos; evita acoplar el resto del código a sus tipos. */
export interface OrtTensor { data: Float32Array | Int32Array | Uint8Array; dims: readonly number[] }
export interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
export interface OrtModule {
  InferenceSession: { create(model: Uint8Array, options?: { executionProviders?: string[] }): Promise<OrtSession> };
  Tensor: new (type: 'float32' | 'uint8', data: Float32Array | Uint8Array, dims: number[]) => OrtTensor;
  env: { wasm: { numThreads: number; wasmPaths?: string } };
}

export interface OrtOptions {
  /** Carpeta/URL con los .wasm de onnxruntime-web. Por defecto los sirve su CDN. */
  wasmPaths?: string;
}

let ortPromise: Promise<OrtModule> | null = null;

/** Carga perezosa: quien no use modelos no paga el peso de onnxruntime-web. */
export function loadOrt(opts: OrtOptions = {}): Promise<OrtModule> {
  ortPromise ??= import('onnxruntime-web').then(m => {
    const ort = m as unknown as OrtModule;
    ort.env.wasm.numThreads = 1; // evita exigir cabeceras COOP/COEP (crossOriginIsolated)
    if (opts.wasmPaths) ort.env.wasm.wasmPaths = opts.wasmPaths;
    return ort;
  });
  ortPromise.catch(() => { ortPromise = null; });
  return ortPromise;
}

/** Descarga un modelo con errores legibles (Vite devuelve index.html con 200 si el archivo no existe). */
export async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el modelo (${res.status}): ${url}`);
  if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`El modelo no existe en ${url} (el servidor devolvió HTML).`);
  return new Uint8Array(await res.arrayBuffer());
}
