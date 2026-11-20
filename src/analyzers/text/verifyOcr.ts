import type { TextLine, TextResult } from '../../core/types';

/** Verificación conservadora: la misma línea debe aparecer en la misma zona en dos pasadas. */
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function intersection(a: TextLine['box'], b: TextLine['box']): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = x * y;
  return area / Math.max(1e-8, Math.min(a.w * a.h, b.w * b.h));
}
function similarity(a: string, b: string): number {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  const dp = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[y.length] / Math.max(x.length, y.length);
}
export function verifyOcrPasses(first: TextResult, second: TextResult, minAgreement = 0.8): TextResult {
  const confirmed = first.lines.filter(a => second.lines.some(b =>
    intersection(a.box, b.box) >= 0.45 && similarity(a.text, b.text) >= minAgreement
  ));
  const rejected = first.lines.filter(a => !confirmed.includes(a));
  const count = confirmed.reduce((n, line) => n + line.text.split(/\s+/).filter(Boolean).length, 0);
  return {
    ...first,
    count,
    discarded: first.discarded + rejected.reduce((n, line) => n + line.text.split(/\s+/).filter(Boolean).length, 0),
    text: confirmed.map(line => line.text).join('\n'),
    lines: confirmed,
    coverage: Number(confirmed.reduce((sum, line) => sum + line.box.w * line.box.h, 0).toFixed(4)),
    verification: { mode: 'conservative', candidates: first.lines.length, confirmed: confirmed.length,
      rejected: rejected.map(line => ({ ...line, reason: 'No coincide con la segunda lectura' })) },
  };
}
