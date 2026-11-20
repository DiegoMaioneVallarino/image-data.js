export { analyzeImage, analyzeFile, analyzePixels } from './core/analyzer';
export type { Analyzed, AnalyzeOptions } from './core/analyzer';
export { createFaceDetector, decodeFaces } from './analyzers/faces/faceAnalyzer';
export type { FaceOptions, FaceDetector } from './analyzers/faces/faceAnalyzer';
export { createObjectDetector, decodeObjects, COCO } from './analyzers/objects/objectAnalyzer';
export type { ObjectOptions, ObjectDetector } from './analyzers/objects/objectAnalyzer';
export { analyzeKind } from './analyzers/kind/kindAnalyzer';
export { createTextReader, decodeText } from './analyzers/text/textAnalyzer';
export type { TextOptions, TextReader } from './analyzers/text/textAnalyzer';
export { describe } from './analyzers/caption/captionAnalyzer';
export { analyzeBatch } from './core/pipeline';
export type { BatchOptions, BatchResult } from './core/pipeline';
export { searchImages, rankImages } from './search/queryEngine';
export { SCHEMA_VERSION, isCurrent, migrate } from './core/schema';
export type { ImageDescriptor, RawImage, SourceInfo, RGB, Region, ColorSample, ColorName, RegionName, FaceItem, FacesResult, ObjectItem, ObjectsResult, ImageKind, KindResult, TextLine, TextResult, Temperature, Orientation } from './core/types';
export type { ImageQuery, SearchHit } from './search/queryEngine';

export { matchesSpatial } from './search/spatial';
export type { SpatialQuery, SpatialSelector, SpatialConstraint, SpatialRelation, SpatialEntity, Box } from './search/spatial';

export { normalizeEmbedding, cosineSimilarity, embedImage, embedText } from './semantic/embeddings';
export type { EmbeddingProvider, EmbeddingRecord } from './semantic/embeddings';
export { VisualIndex } from './semantic/index';
export type { SimilarityHit, SimilarityOptions } from './semantic/index';

export { verifyOcrPasses } from './analyzers/text/verifyOcr';
