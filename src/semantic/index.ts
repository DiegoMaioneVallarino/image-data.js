import { cosineSimilarity, normalizeEmbedding } from './embeddings';
import type { EmbeddingRecord } from './embeddings';
import { rankImages } from '../search/queryEngine';
import type { ImageQuery } from '../search/queryEngine';
import type { ImageDescriptor } from '../core/types';

export interface SimilarityHit { imageId: string; similarity: number; score: number }
export interface SimilarityOptions { modelId: string; minSimilarity?: number; limit?: number; excludeImageId?: string }

/** Índice exacto en memoria: O(n*d), adecuado para MVP y bibliotecas moderadas. */
export class VisualIndex {
  private readonly records = new Map<string, EmbeddingRecord>();
  private dimensions = new Map<string, number>();

  add(record: EmbeddingRecord): void {
    if (!record.imageId || !record.modelId) throw new Error('imageId y modelId son obligatorios');
    const vector = normalizeEmbedding(record.vector);
    const dim = this.dimensions.get(record.modelId);
    if (dim !== undefined && dim !== vector.length) throw new Error('Dimensiones inconsistentes para el modelo');
    this.dimensions.set(record.modelId, vector.length);
    this.records.set(`${record.modelId}::${record.imageId}`, { ...record, vector });
  }
  remove(imageId: string, modelId: string): boolean { return this.records.delete(`${modelId}::${imageId}`); }
  size(): number { return this.records.size; }
  exportRecords(): EmbeddingRecord[] { return Array.from(this.records.values()).map(r => ({ ...r, vector: [...r.vector] })); }
  static fromRecords(records: EmbeddingRecord[]): VisualIndex {
    const index = new VisualIndex();
    for (const record of records) index.add(record);
    return index;
  }
  search(vector: readonly number[], options: SimilarityOptions): SimilarityHit[] {
    const query = normalizeEmbedding(vector);
    const dim = this.dimensions.get(options.modelId);
    if (dim !== undefined && query.length !== dim) throw new Error('Dimensión de consulta incompatible');
    const min = options.minSimilarity ?? -1;
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 0) throw new Error('limit debe ser entero no negativo');
    const hits: SimilarityHit[] = [];
    for (const r of this.records.values()) {
      if (r.modelId !== options.modelId || r.imageId === options.excludeImageId) continue;
      const similarity = cosineSimilarity(query, r.vector);
      if (similarity >= min) hits.push({ imageId: r.imageId, similarity, score: (similarity + 1) / 2 });
    }
    return hits.sort((a,b) => b.similarity - a.similarity || a.imageId.localeCompare(b.imageId)).slice(0,limit);
  }
  /** Aplica primero los filtros existentes; luego ordena por similitud visual. */
  searchFiltered(vector: readonly number[], options: SimilarityOptions, descriptors: ImageDescriptor[], filters: ImageQuery = {}): Array<SimilarityHit & { descriptor: ImageDescriptor }> {
    const eligible = new Map(rankImages(descriptors, filters).map(h => [h.descriptor.id, h.descriptor]));
    return this.search(vector, { ...options, limit: this.records.size() })
      .filter(hit => eligible.has(hit.imageId))
      .slice(0, options.limit ?? 50)
      .map(hit => ({ ...hit, descriptor: eligible.get(hit.imageId)! }));
  }
}
