# ImageData.js v0.6 — Spatial Search Engine

This release adds spatial predicates to the existing `rankImages` / `searchImages` API. No descriptor schema migration is required; it uses existing normalized detection boxes.

```ts
import { searchImages } from 'image-data.js';
const results = searchImages(descriptors, {
  orientation: 'landscape',
  spatial: {
    entities: [{ type: 'object', value: 'person', minCount: 1, minScore: 0.6 }],
    relations: [{
      subject: { type: 'object', value: 'person' },
      relation: 'left-of',
      target: { type: 'object', value: 'car' }
    }]
  }
});
```

Supported selectors: `object` (COCO class or Spanish label), `face`, `text` (OCR substring). Filter by 3×3 region, confidence and normalized bounding-box area. `entities` supports min/max count. Relations: `left-of`, `right-of`, `above`, `below`, `overlaps`, `inside`, `contains`, `near` (distance between centers). All clauses use AND. Relations match at least one pair; no inference of object color or segmentation. Direction compares centers, not separation of edges. An unrun or failed detector does not satisfy a filter. `near` uses normalized image coordinates, not physical distance.

Run `npm install`, `npm run typecheck`, `npm test`, `npm run build:lib` and `npm pack` to validate and package locally.
