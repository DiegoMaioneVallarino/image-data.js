import type { ImageDescriptor, RawImage, SourceInfo } from './types';
import { SCHEMA_VERSION } from './schema';
import { decodeFile, decodePixels, prepareFile } from '../utils/imageLoader';
import { analyzeMetadata } from '../analyzers/metadata/metadataAnalyzer';
import { analyzeColors } from '../analyzers/colors/colorAnalyzer';
import { analyzeLighting } from '../analyzers/lighting/lightingAnalyzer';
import { analyzeGeometry } from '../analyzers/geometry/geometryAnalyzer';
import { getFaceDetector, type FaceOptions } from '../analyzers/faces/faceAnalyzer';
import { getObjectDetector, type ObjectOptions } from '../analyzers/objects/objectAnalyzer';
import { analyzeKind } from '../analyzers/kind/kindAnalyzer';
import { getTextReader, type TextOptions } from '../analyzers/text/textAnalyzer';
import { describe } from '../analyzers/caption/captionAnalyzer';

export interface Analyzed { descriptor: ImageDescriptor; thumbnail: Blob; /** Módulos opcionales que no pudieron correr */ warnings: string[] }
export interface AnalyzeOptions {
  /** Si se omite, no se detectan rostros. */ faces?: FaceOptions;
  /** Si se omite, no se detectan objetos (COCO). */ objects?: ObjectOptions;
  /** Si se omite, no se lee texto (OCR). */ text?: TextOptions;
  /**
   * Qué hacer con rostros y objetos cuando la imagen no es una foto (ilustración, vector, pixel art).
   * Esos modelos solo se entrenaron con fotos y alucinan en gráficos, así que por defecto se omiten ('skip').
   * Con 'run' se ejecutan igual. El OCR corre siempre.
   */
  nonPhoto?: 'skip' | 'run';
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Núcleo puro: píxeles + datos de origen -> descriptor. Sin DOM, corre en Node, workers o tests. */
export function analyzePixels(pixels: RawImage, source: SourceInfo): ImageDescriptor {
  const d: ImageDescriptor = {
    version: SCHEMA_VERSION, id: newId(), filename: source.filename,
    metadata: analyzeMetadata(source, pixels), colors: analyzeColors(pixels),
    lighting: analyzeLighting(pixels), geometry: analyzeGeometry(pixels), kind: analyzeKind(pixels),
    analyzedAt: new Date().toISOString(),
  };
  return Object.assign(d, describe(d));
}

export async function analyzeFile(file: File, opts: AnalyzeOptions = {}): Promise<Analyzed> {
  file = await prepareFile(file); // SVG -> PNG (no-op para el resto)
  const { pixels, source, thumbnail } = await decodeFile(file);
  const descriptor = analyzePixels(pixels, source);
  const warnings: string[] = [];
  // Los modelos de rostros y objetos solo conocen fotos: en gráficos y pixel art se omiten (ausente != "sin rostros").
  const photoLike = descriptor.kind?.type === 'photo' || opts.nonPhoto === 'run';
  if (opts.faces && photoLike) {
    // Un modelo ausente o roto no debe tirar el análisis base: se avisa y se omite `faces`.
    try { descriptor.faces = await (await getFaceDetector(opts.faces)).detect(pixels); }
    catch (e) { warnings.push(`Rostros desactivados: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (opts.objects && photoLike) {
    try { descriptor.objects = await (await getObjectDetector(opts.objects)).detect(pixels); }
    catch (e) { warnings.push(`Objetos desactivados: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (opts.text && !(opts.text.skipPhotos && descriptor.kind?.type === 'photo')) {
    try {
      // El OCR lee a más resolución que el análisis base (512 px), si no el texto pequeño se pierde.
      const big = await decodePixels(file, opts.text.maxSide ?? 1280, opts.text.minSide ?? 640);
      descriptor.text = await (await getTextReader(opts.text)).read(big, { strict: descriptor.kind?.type === 'photo' });
    } catch (e) { warnings.push(`Texto desactivado: ${e instanceof Error ? e.message : String(e)}`); }
  }
  // La descripción se rehace al final para incorporar rostros y objetos.
  if (descriptor.faces || descriptor.objects || descriptor.text) Object.assign(descriptor, describe(descriptor));
  return { descriptor, thumbnail, warnings };
}

export async function analyzeImage(file: File, opts?: AnalyzeOptions): Promise<ImageDescriptor> {
  return (await analyzeFile(file, opts)).descriptor;
}
