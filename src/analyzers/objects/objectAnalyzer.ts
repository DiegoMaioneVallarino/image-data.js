import type { ObjectItem, ObjectsResult, RawImage } from '../../core/types';
import { fetchModel, loadOrt, type OrtModule, type OrtOptions, type OrtSession, type OrtTensor } from '../../models/ort';
import { regionOf } from '../faces/faceAnalyzer';

// SSD-MobileNet v1 entrenado en COCO (onnx/models: ssd_mobilenet_v1_12.onnx, Apache-2.0).
export const OBJECT_MODEL_ID = 'ssd-mobilenet-v1-coco';

export interface ObjectOptions extends OrtOptions {
  /** URL del .onnx, p. ej. '/models/ssd_mobilenet_v1_12.onnx' */
  modelUrl: string;
  /** Confianza mínima (0..1). Por defecto 0.5. */
  minScore?: number;
  /** Máximo de detecciones devueltas. Por defecto 20. */
  maxItems?: number;
  /** Clases COCO (en inglés) que se descartan, p. ej. ['person'] si ya cuentas rostros aparte. */
  ignore?: string[];
}

/**
 * IDs de categoría de COCO tal como los emite el modelo (1..90, con huecos) ->
 * [clase en inglés, singular es, plural es].
 */
export const COCO: Readonly<Record<number, readonly [string, string, string]>> = {
  1: ['person', 'persona', 'personas'], 2: ['bicycle', 'bicicleta', 'bicicletas'], 3: ['car', 'auto', 'autos'],
  4: ['motorcycle', 'moto', 'motos'], 5: ['airplane', 'avión', 'aviones'], 6: ['bus', 'autobús', 'autobuses'],
  7: ['train', 'tren', 'trenes'], 8: ['truck', 'camión', 'camiones'], 9: ['boat', 'barco', 'barcos'],
  10: ['traffic light', 'semáforo', 'semáforos'], 11: ['fire hydrant', 'hidrante', 'hidrantes'],
  13: ['stop sign', 'señal de alto', 'señales de alto'], 14: ['parking meter', 'parquímetro', 'parquímetros'],
  15: ['bench', 'banca', 'bancas'], 16: ['bird', 'ave', 'aves'], 17: ['cat', 'gato', 'gatos'], 18: ['dog', 'perro', 'perros'],
  19: ['horse', 'caballo', 'caballos'], 20: ['sheep', 'oveja', 'ovejas'], 21: ['cow', 'vaca', 'vacas'],
  22: ['elephant', 'elefante', 'elefantes'], 23: ['bear', 'oso', 'osos'], 24: ['zebra', 'cebra', 'cebras'],
  25: ['giraffe', 'jirafa', 'jirafas'], 27: ['backpack', 'mochila', 'mochilas'], 28: ['umbrella', 'paraguas', 'paraguas'],
  31: ['handbag', 'bolso', 'bolsos'], 32: ['tie', 'corbata', 'corbatas'], 33: ['suitcase', 'maleta', 'maletas'],
  34: ['frisbee', 'frisbee', 'frisbees'], 35: ['skis', 'esquí', 'esquís'], 36: ['snowboard', 'tabla de snowboard', 'tablas de snowboard'],
  37: ['sports ball', 'balón', 'balones'], 38: ['kite', 'papalote', 'papalotes'], 39: ['baseball bat', 'bate de béisbol', 'bates de béisbol'],
  40: ['baseball glove', 'guante de béisbol', 'guantes de béisbol'], 41: ['skateboard', 'patineta', 'patinetas'],
  42: ['surfboard', 'tabla de surf', 'tablas de surf'], 43: ['tennis racket', 'raqueta de tenis', 'raquetas de tenis'],
  44: ['bottle', 'botella', 'botellas'], 46: ['wine glass', 'copa de vino', 'copas de vino'], 47: ['cup', 'taza', 'tazas'],
  48: ['fork', 'tenedor', 'tenedores'], 49: ['knife', 'cuchillo', 'cuchillos'], 50: ['spoon', 'cuchara', 'cucharas'],
  51: ['bowl', 'tazón', 'tazones'], 52: ['banana', 'plátano', 'plátanos'], 53: ['apple', 'manzana', 'manzanas'],
  54: ['sandwich', 'sándwich', 'sándwiches'], 55: ['orange', 'naranja', 'naranjas'], 56: ['broccoli', 'brócoli', 'brócolis'],
  57: ['carrot', 'zanahoria', 'zanahorias'], 58: ['hot dog', 'hot dog', 'hot dogs'], 59: ['pizza', 'pizza', 'pizzas'],
  60: ['donut', 'dona', 'donas'], 61: ['cake', 'pastel', 'pasteles'], 62: ['chair', 'silla', 'sillas'], 63: ['couch', 'sofá', 'sofás'],
  64: ['potted plant', 'planta en maceta', 'plantas en maceta'], 65: ['bed', 'cama', 'camas'],
  67: ['dining table', 'mesa', 'mesas'], 70: ['toilet', 'inodoro', 'inodoros'], 72: ['tv', 'televisor', 'televisores'],
  73: ['laptop', 'laptop', 'laptops'], 74: ['mouse', 'ratón', 'ratones'], 75: ['remote', 'control remoto', 'controles remotos'],
  76: ['keyboard', 'teclado', 'teclados'], 77: ['cell phone', 'celular', 'celulares'], 78: ['microwave', 'microondas', 'microondas'],
  79: ['oven', 'horno', 'hornos'], 80: ['toaster', 'tostador', 'tostadores'], 81: ['sink', 'lavabo', 'lavabos'],
  82: ['refrigerator', 'refrigerador', 'refrigeradores'], 84: ['book', 'libro', 'libros'], 85: ['clock', 'reloj', 'relojes'],
  86: ['vase', 'florero', 'floreros'], 87: ['scissors', 'tijeras', 'tijeras'], 88: ['teddy bear', 'oso de peluche', 'osos de peluche'],
  89: ['hair drier', 'secadora de pelo', 'secadoras de pelo'], 90: ['toothbrush', 'cepillo de dientes', 'cepillos de dientes'],
};

/** Plural en español de una clase COCO (inglés); si no se conoce, devuelve la propia clase. */
const PLURAL_BY_CLASS = new Map(Object.values(COCO).map(([en, , pl]) => [en, pl]));
export const pluralOf = (cls: string): string => PLURAL_BY_CLASS.get(cls) ?? cls;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r4 = (v: number) => Number(v.toFixed(4));

/** RGBA -> RGB empaquetado (NHWC, uint8). El modelo redimensiona por dentro, así que no hace falta escalar. */
export function toRgb(img: RawImage): Uint8Array {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { out[j] = data[i]; out[j + 1] = data[i + 1]; out[j + 2] = data[i + 2]; }
  return out;
}

/**
 * Salidas del modelo (el NMS por clase ya va dentro del grafo):
 * boxes [1,N,4] como [ymin,xmin,ymax,xmax] normalizadas, classes [1,N] (ids COCO, float), scores [1,N].
 */
export function decodeObjects(
  boxes: ArrayLike<number>, classes: ArrayLike<number>, scores: ArrayLike<number>,
  opts: { minScore?: number; maxItems?: number; ignore?: string[]; num?: number } = {},
): ObjectsResult {
  const { minScore = 0.5, maxItems = 20 } = opts;
  const ignore = new Set(opts.ignore ?? []);
  const n = Math.min(scores.length, classes.length, Math.floor(boxes.length / 4), opts.num ?? Infinity);
  const items: ObjectItem[] = [];
  for (let i = 0; i < n; i++) {
    const score = scores[i];
    if (!(score >= minScore)) continue;
    const entry = COCO[Math.round(classes[i])];
    if (!entry || ignore.has(entry[0])) continue;
    const y1 = clamp01(boxes[i * 4]), x1 = clamp01(boxes[i * 4 + 1]), y2 = clamp01(boxes[i * 4 + 2]), x2 = clamp01(boxes[i * 4 + 3]);
    const w = x2 - x1, h = y2 - y1;
    if (!(w > 0 && h > 0)) continue;
    items.push({ class: entry[0], label: entry[1], score: r4(score), box: { x: r4(x1), y: r4(y1), w: r4(w), h: r4(h) }, areaRatio: r4(w * h), position: regionOf(x1 + w / 2, y1 + h / 2) });
  }
  items.sort((a, b) => b.score - a.score);
  const kept = items.slice(0, maxItems);
  const counts: Record<string, number> = {};
  for (const it of kept) counts[it.class] = (counts[it.class] ?? 0) + 1;
  return { model: OBJECT_MODEL_ID, count: kept.length, counts, items: kept };
}

export interface ObjectDetector { detect(img: RawImage): Promise<ObjectsResult> }

/** Localiza las salidas por forma/nombre: las exportaciones de TF difieren en sufijos como ':0'. */
function pickOutputs(out: Record<string, OrtTensor>) {
  const entries = Object.entries(out);
  const byName = (re: RegExp) => entries.find(([k]) => re.test(k))?.[1];
  const boxes = entries.find(([, t]) => t.dims.length === 3 && t.dims[t.dims.length - 1] === 4)?.[1];
  const classes = byName(/class/i), scores = byName(/score/i), num = byName(/num/i);
  if (!boxes || !classes || !scores) throw new Error('Salidas inesperadas: ¿es ssd_mobilenet_v1_12.onnx (COCO)?');
  return { boxes, classes, scores, num };
}

export async function createObjectDetector(opts: ObjectOptions): Promise<ObjectDetector> {
  const ort: OrtModule = await loadOrt(opts);
  const session: OrtSession = await ort.InferenceSession.create(await fetchModel(opts.modelUrl), { executionProviders: ['wasm'] });
  const input = session.inputNames[0];
  return {
    async detect(img) {
      const feeds = { [input]: new ort.Tensor('uint8', toRgb(img), [1, img.height, img.width, 3]) };
      const { boxes, classes, scores, num } = pickOutputs(await session.run(feeds));
      return decodeObjects(boxes.data, classes.data, scores.data, { minScore: opts.minScore, maxItems: opts.maxItems, ignore: opts.ignore, num: num ? Number(num.data[0]) : undefined });
    },
  };
}

// Un detector por modelUrl; si la carga falla se recuerda el error para no reintentar por cada imagen.
const cache = new Map<string, Promise<ObjectDetector>>();
export function getObjectDetector(opts: ObjectOptions): Promise<ObjectDetector> {
  let p = cache.get(opts.modelUrl);
  if (!p) { p = createObjectDetector(opts); cache.set(opts.modelUrl, p); }
  return p;
}
