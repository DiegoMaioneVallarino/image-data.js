# ImageData.js v0.9.2 — Annotation Engine

Manual region annotation in the React laboratory. Draw normalized bounding boxes or polygons, label them, assign a parent annotation, and automatically compute the v0.9.1 OKLab color and light profile within the region. Annotations persist alongside descriptors in IndexedDB and are included in JSON exports.

## Public TypeScript API

```ts
import { addAnnotation, boxFromPoints, analyzeAnnotation, extractRegion } from 'image-data.js';
const geometry = boxFromPoints({x:0.1,y:0.2},{x:0.8,y:0.9});
const visual = analyzeAnnotation(rawImage, geometry);
const next = addAnnotation(existing, {id:'person-1',label:'person',geometry,source:'human',createdAt:new Date().toISOString(),visual});
```

Coordinates are normalized to the image dimensions. Polygons use even-odd ray casting; regions outside the polygon are transparent. Parent-child annotations are references by ID; removing a parent also removes descendants. This version does **not** implement freehand masks, vertex editing, AI segmentation or semantic labeling. The demo analyzes the stored thumbnail, not the full original: for production quality, retain and load the original image before computing region color metrics. Avoid uploading private images to third-party AI without consent.
