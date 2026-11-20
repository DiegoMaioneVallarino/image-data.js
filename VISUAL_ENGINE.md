# ImageData.js v0.9.1 — Visual Structure / Color Engine

Adds deterministic, DOM-free `analyzeVisual(pixels, options)` and `descriptor.visual`.

- OKLab perceptual k-means (deterministic farthest-point seeds), palette of 1–32 representative colors, each with coverage fraction and RGB/hex/OKLab.
- Linear-light luminance: mean, median, p10, p90, standard deviation (contrast), shadow/highlight share and p90–p10 range.
- Configurable NxN spatial grid (1–8) with local palette, brightness, saturation and average color.
- Chroma-weighted normalized center of color.
- Ignores pixels with alpha <128; sampling limited by `maxSamples` for performance.

```ts
import { analyzeVisual } from 'image-data.js';
const profile = analyzeVisual(rawImage, { paletteSize: 8, gridSize: 3, maxSamples: 12000 });
```

This release retains v0.8 optional OCR/object/face modules for backward compatibility. Contextual analysis is NOT run unless explicitly requested. Existing rule-based caption still runs for legacy compatibility; it is not AI-generated. No semantic inference or manual segmentation editor is included in 0.9.1. Previous descriptors lack `visual` and must be reanalyzed to populate it.

Run `npm install`, `npm run typecheck`, `npm test`, `npm run build:lib`, `npm run dev`.
