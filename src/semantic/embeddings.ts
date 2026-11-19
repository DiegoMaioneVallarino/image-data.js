/** Vectores proporcionados por un modelo externo (p.ej. CLIP). No incluye pesos ni descarga modelos. */
export interface EmbeddingProvider {
  readonly modelId: string;
  embedImage(input: Blob): Promise<readonly number[]>;
  embedText?(text: string): Promise<readonly number[]>;
}
export interface EmbeddingRecord {
  imageId: string;
  modelId: string;
  vector: number[];
}

export function normalizeEmbedding(vector: readonly number[]): number[] {
  if (!vector.length || vector.some(v => !Number.isFinite(v))) throw new Error('Embedding vacío o no finito');
  const norm = Math.hypot(...vector);
  if (!(norm > 0)) throw new Error('Embedding de norma cero');
  return vector.map(v => v / norm);
}

/** Similitud coseno [-1,1]. Rechaza vectores de diferentes dimensiones. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Dimensiones de embeddings incompatibles');
  const x = normalizeEmbedding(a), y = normalizeEmbedding(b);
  return Math.max(-1, Math.min(1, x.reduce((sum, v, i) => sum + v * y[i], 0)));
}

export async function embedImage(provider: EmbeddingProvider, image: Blob, imageId: string): Promise<EmbeddingRecord> {
  return { imageId, modelId: provider.modelId, vector: normalizeEmbedding(await provider.embedImage(image)) };
}

export async function embedText(provider: EmbeddingProvider, text: string): Promise<number[]> {
  if (!provider.embedText) throw new Error('El proveedor no soporta embeddings de texto');
  return normalizeEmbedding(await provider.embedText(text));
}
