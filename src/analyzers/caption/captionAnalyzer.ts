import type { ColorName, ImageDescriptor, ImageKind } from '../../core/types';
import { pluralOf } from '../objects/objectAnalyzer';

const COLOR_ES: Record<ColorName, string> = {
  red: 'rojo', orange: 'naranja', yellow: 'amarillo', green: 'verde', cyan: 'cian', blue: 'azul', purple: 'morado',
  pink: 'rosa', brown: 'café', black: 'negro', white: 'blanco', gray: 'gris',
};

// Sustantivo y género con que se abre la frase según el tipo de imagen.
const NOUN: Record<ImageKind, { word: string; fem: boolean; tag: string }> = {
  photo: { word: 'Foto', fem: true, tag: 'foto' },
  graphic: { word: 'Ilustración o gráfico', fem: true, tag: 'ilustración' },
  'pixel-art': { word: 'Pixel art', fem: false, tag: 'pixel art' },
};
const ORIENTATION_ES = { landscape: ['horizontal', 'horizontal'], portrait: ['vertical', 'vertical'], square: ['cuadrada', 'cuadrado'] } as const;

type Input = Pick<ImageDescriptor, 'metadata' | 'colors' | 'lighting'> & Partial<Pick<ImageDescriptor, 'faces' | 'objects' | 'kind' | 'text'>>;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function joinEs(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}
const snippet = (t: string, max = 80) => { const one = t.replace(/\s+/g, ' ').trim(); return one.length > max ? `${one.slice(0, max - 1)}…` : one; };

/**
 * Descripción y etiquetas en español, deterministas y sin modelo de lenguaje:
 * se componen a partir de lo que ya midió el resto de analizadores.
 */
export function describe(d: Input): { caption: string; tags: string[] } {
  const tags = new Set<string>();
  const sentences: string[] = [];
  const kind: ImageKind = d.kind?.type ?? 'photo';
  const noun = NOUN[kind], g = noun.fem ? 0 : 1;

  // 1) Formato, luz y color
  const { brightness, contrast } = d.lighting;
  const light: [string, string] | null = brightness < 0.25 ? ['oscura', 'oscuro'] : brightness > 0.7 ? ['muy luminosa', 'muy luminoso'] : brightness > 0.55 ? ['luminosa', 'luminoso'] : null;
  const flat = contrast < 0.1 ? 'de bajo contraste' : '';
  const { saturation, temperature, dominantName } = d.colors;
  const tone = saturation < 0.06 ? 'casi sin color' : temperature === 'warm' ? 'de tonos cálidos' : temperature === 'cool' ? 'de tonos fríos' : '';
  const orient = ORIENTATION_ES[d.metadata.orientation][g];
  const head = [noun.word, orient, light?.[g], flat].filter(Boolean).join(' ') + (tone ? `, ${tone}` : '');
  const palette = kind === 'pixel-art' && d.kind ? ` Paleta reducida (${d.kind.metrics.distinctColors} colores).` : '';
  sentences.push(`${head}, con ${COLOR_ES[dominantName]} como color predominante.${palette}`);
  tags.add(noun.tag);
  for (const o of new Set(ORIENTATION_ES[d.metadata.orientation])) tags.add(o);
  tags.add(COLOR_ES[dominantName]);
  if (light) for (const w of brightness < 0.25 ? ['oscura', 'oscuro'] : ['luminosa', 'luminoso']) tags.add(w);
  if (temperature !== 'neutral' && saturation >= 0.06) for (const w of temperature === 'warm' ? ['cálida', 'cálido'] : ['fría', 'frío']) tags.add(w);

  // 2) Contenido: objetos COCO (si hay) y rostros
  const objs = d.objects;
  if (objs && objs.count > 0) {
    const ranked = Object.entries(objs.counts).sort((a, b) => b[1] - a[1]);
    const label = (cls: string) => objs.items.find(i => i.class === cls)!.label;
    const shown = ranked.slice(0, 4).map(([cls, n]) => count(n, label(cls), pluralOf(cls)));
    const extra = ranked.length - shown.length;
    sentences.push(`Se aprecian ${joinEs(shown)}${extra > 0 ? ' y otros elementos' : ''}.`);
    for (const [cls] of ranked) tags.add(label(cls));
    const main = objs.items.reduce((m, i) => (i.areaRatio > m.areaRatio ? i : m), objs.items[0]);
    if (main.areaRatio >= 0.25) sentences.push(`Sujeto principal: ${main.label} (ocupa ~${Math.round(main.areaRatio * 100)}% de la imagen).`);
  } else if (objs) tags.add('sin objetos reconocibles');

  const people = objs?.counts.person ?? 0;
  if (d.faces && d.faces.count > 0) {
    tags.add('rostros');
    // Si COCO ya contó personas, los rostros no se repiten en la frase.
    if (!people) sentences.push(`${count(d.faces.count, 'rostro visible', 'rostros visibles')}.`);
  }
  if (people > 0) tags.add('personas');

  // 3) Texto reconocido (OCR)
  if (d.text && d.text.count > 0) {
    tags.add('texto');
    sentences.push(`Contiene texto: «${snippet(d.text.text)}».`);
  }

  return { caption: sentences.join(' '), tags: [...tags] };
}
