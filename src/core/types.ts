export type Orientation = 'portrait' | 'landscape' | 'square';
export interface RGB { r: number; g: number; b: number }

/** Píxeles crudos RGBA. `ImageData` del navegador cumple esta interfaz. */
export interface RawImage { width: number; height: number; data: Uint8ClampedArray }

/** Datos del archivo original; los aporta el loader, los analizadores no tocan el DOM. */
export interface SourceInfo { filename: string; bytes: number; mime: string; width: number; height: number }

export type ColorName =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink' | 'brown'
  | 'black' | 'white' | 'gray';
export type Temperature = 'warm' | 'cool' | 'neutral';

export interface ColorSample { hex: string; rgb: RGB; name: ColorName; percent: number }
export type RegionName = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export interface FaceItem {
  /** Caja normalizada 0..1 respecto a la imagen */
  box: { x: number; y: number; w: number; h: number };
  score: number;
  /** Fracción de la imagen que ocupa el rostro (0..1) */
  areaRatio: number;
  /** Celda 3x3 donde cae el centro del rostro */
  position: RegionName;
}
export interface FacesResult { model: string; count: number; largestAreaRatio: number; items: FaceItem[] }
export interface ObjectItem {
  /** Clase COCO en inglés (clave estable para filtros y conteos), p. ej. 'person' */
  class: string;
  /** Nombre en español, singular, p. ej. 'persona' */
  label: string;
  score: number;
  /** Caja normalizada 0..1 respecto a la imagen */
  box: { x: number; y: number; w: number; h: number };
  /** Fracción de la imagen que ocupa el objeto (0..1) */
  areaRatio: number;
  /** Celda 3x3 donde cae el centro del objeto */
  position: RegionName;
}
export interface ObjectsResult {
  model: string;
  count: number;
  /** Detecciones por clase COCO (inglés), p. ej. { person: 2, dog: 1 } */
  counts: Record<string, number>;
  /** Ordenados por confianza descendente */
  items: ObjectItem[];
}
export type ImageKind = 'photo' | 'graphic' | 'pixel-art';
export interface KindResult {
  type: ImageKind;
  /** Métricas crudas con las que se decidió; sirven para ajustar umbrales con tus propias imágenes. */
  metrics: {
    /** Colores RGB exactos distintos (se detiene en 5000) */ distinctColors: number;
    /** Fracción de píxeles cubierta por los 16 colores (cuantizados a 4 bits) más frecuentes */ top16Share: number;
    /** Fracción de píxeles idénticos (±3) a su vecino derecho e inferior */ flatShare: number;
    /** Tamaño de "píxel" detectado en pixel art ampliado (1 = no detectado) */ blockSize: number;
    /** Fracción de píxeles transparentes */ transparentShare: number;
  };
}
export interface TextLine { text: string; /** 0..100 */ confidence: number; box: { x: number; y: number; w: number; h: number } }
export interface TextResult {
  engine: string;
  languages: string;
  /** Palabras reconocidas que pasaron todos los filtros */ count: number;
  /** Palabras que Tesseract devolvió pero se descartaron (baja confianza o basura); útil para ajustar filtros. */ discarded: number;
  /** Texto completo, una línea por renglón */ text: string;
  /** Fracción de la imagen cubierta por texto (0..1) */ coverage: number;
  lines: TextLine[];
}
export interface Region { name: string; average: RGB; brightness: number; edgeDensity: number }

export interface ImageDescriptor {
  /** Versión del esquema; ver SCHEMA_VERSION en core/schema.ts */
  version: string;
  id: string;
  filename: string;
  metadata: {
    width: number; height: number; aspectRatio: number; orientation: Orientation;
    bytes: number; mime: string; hasTransparency: boolean;
  };
  colors: {
    average: RGB;
    /** Paleta sin tonos casi duplicados, ordenada por peso */
    dominant: ColorSample[];
    /** Nombre del color que más píxeles acumula (agrupando todos los tonos) */
    dominantName: ColorName;
    /** Porcentaje (0-100) de píxeles por nombre de color */
    share: Partial<Record<ColorName, number>>;
    histogram: { r: number[]; g: number[]; b: number[] };
    /** Croma media 0..1: (max-min)/255. Estable en zonas oscuras, a diferencia de HSV. */
    saturation: number;
    temperature: Temperature;
  };
  lighting: { brightness: number; contrast: number };
  geometry: { edgeDensity: number; regions: Region[] };
  /** Ausente si no se cargó el modelo de rostros; no equivale a "sin rostros" (eso es count: 0). */
  faces?: FacesResult;
  /** Tipo de imagen. Los detectores de rostros y objetos solo se entrenaron con fotos; ver AnalyzeOptions.nonPhoto. */
  kind?: KindResult;
  /** Ausente si el OCR no se activó o falló; no equivale a "sin texto" (eso es count: 0). */
  text?: TextResult;
  /** Ausente si no se cargó el modelo de objetos; no equivale a "sin objetos" (eso es count: 0). */
  objects?: ObjectsResult;
  /** Descripción corta en español, generada con reglas (sin LLM) a partir del resto del descriptor. */
  caption?: string;
  /** Etiquetas en español derivadas del descriptor, sin repetir. */
  tags?: string[];
  analyzedAt: string;
}
