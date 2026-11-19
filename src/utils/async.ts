export class TimeoutError extends Error {}

/** Rechaza con TimeoutError si `p` no se resuelve en `ms`. ms <= 0 o no finito = sin límite. No cancela `p`. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(message)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
