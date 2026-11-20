import type { ImageDescriptor } from './types';
import { describe } from '../analyzers/caption/captionAnalyzer';

/** Súbela cuando cambie la forma del descriptor. */
export const SCHEMA_VERSION = '0.9.2';

export function isCurrent(d: { version?: string }): d is ImageDescriptor {
  return d?.version === SCHEMA_VERSION;
}

/**
 * Punto único de migración.
 * - 0.2.0 / 0.3.0 -> 0.4.0: solo añaden campos opcionales (`objects`, `kind`, `text`, `caption`, `tags`).
 *   `caption` y `tags` se reconstruyen desde el propio descriptor; `kind` y `text` quedan ausentes
 *   (= "sin analizar"; `kind` necesita los píxeles, así que hay que reanalizar para obtenerlo).
 * - 0.1.0 carece de nombres de color y no se puede reconstruir sin los píxeles: devuelve null
 *   y el llamador decide reanalizar.
 */
export function migrate(d: { version?: string }): ImageDescriptor | null {
  if (isCurrent(d)) return d;
  if (d?.version === '0.9.1' || d?.version === '0.8.0' || d?.version === '0.7.0' || d?.version === '0.6.0' || d?.version === '0.5.0' || d?.version === '0.2.0' || d?.version === '0.3.0' || d?.version === '0.4.0') {
    const old = d as unknown as ImageDescriptor;
    return { ...old, version: SCHEMA_VERSION, annotations: old.annotations ?? [], visual: old.visual, ...describe(old) };
  }
  return null;
}
