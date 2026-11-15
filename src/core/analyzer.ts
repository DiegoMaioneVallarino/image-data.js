import type { ImageDescriptor } from './types';
import { loadImage, pixelsOf } from '../utils/imageLoader';
import { analyzeMetadata } from '../analyzers/metadata/metadataAnalyzer';
import { analyzeColors } from '../analyzers/colors/colorAnalyzer';
import { analyzeLighting } from '../analyzers/lighting/lightingAnalyzer';
import { analyzeGeometry } from '../analyzers/geometry/geometryAnalyzer';
export async function analyzeImage(file: File): Promise<ImageDescriptor> {
  const image = await loadImage(file);
  const pixels = pixelsOf(image);
  return {
    version: '0.1.0', id: crypto.randomUUID(), filename: file.name,
    metadata: analyzeMetadata(file, image), colors: analyzeColors(pixels),
    lighting: analyzeLighting(pixels), geometry: analyzeGeometry(pixels),
    analyzedAt: new Date().toISOString()
  };
}
