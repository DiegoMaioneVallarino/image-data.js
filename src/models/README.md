# Modelos ONNX

## Rostros: Ultra-Light-Fast-Generic-Face-Detector (version-RFB-320, MIT)
1. `npm install onnxruntime-web`
2. Descarga `version-RFB-320.onnx` (≈1.2 MB) del repo onnx/models
   (validated/vision/body_analysis/ultraface/models/) y colócalo en `public/models/`.
3. Para trabajar sin internet, copia los `.wasm` de `node_modules/onnxruntime-web/dist/`
   a `public/ort/` y pasa `wasmPaths: '/ort/'` en `FaceOptions`. Si no, se cargan desde el CDN de jsDelivr.

Sin el archivo, la app funciona igual y muestra el aviso "Rostros desactivados".

## Objetos: SSD-MobileNet v1 (COCO, 80 clases, Apache-2.0)
1. `npm install onnxruntime-web` (si no lo hiciste ya para rostros).
2. Descarga `ssd_mobilenet_v1_12.onnx` (≈29 MB) del repo onnx/models
   (validated/vision/object_detection_segmentation/ssd-mobilenetv1/model/) y colócalo en `public/models/`.
3. Actívalo con `objects: { modelUrl: '/models/ssd_mobilenet_v1_12.onnx' }` en las opciones de análisis.
   Opcionales: `minScore` (0.5), `maxItems` (20), `ignore` (clases COCO a omitir, p. ej. `['person']`).

El descriptor gana `objects` (conteos y cajas), `caption` (descripción en español) y `tags`.
Sin el archivo, la app funciona igual y muestra el aviso "Objetos desactivados".

## Texto (OCR): Tesseract.js
1. `npm install tesseract.js` (v6 o superior; se carga de forma perezosa solo si activas `text`).
2. Actívalo con `text: { languages: 'eng+spa' }`. La primera vez descarga el motor WASM y los datos de idioma
   (unos MB por idioma) desde su CDN, y el navegador los cachea.
3. Sin internet: copia `worker.min.js`, el `.wasm.js` de `tesseract.js-core` y los `.traineddata.gz` a `public/tesseract/`
   y pasa `{ workerPath, corePath, langPath }` apuntando a esas rutas.
4. Anti-falsos positivos: se descartan palabras con confianza < `minConfidence` (70) o que no parecen palabras
   (letras sueltas, 'iii', sin vocales, mayúsculas caóticas) y, si quedan menos de `minWords` (2), se declara "sin texto".
   En fotos el modo es más estricto (confianza >= 80 y 3 palabras). `skipPhotos: true` desactiva el OCR en fotos.
   `text.discarded` cuenta lo descartado, útil para ajustar. Otros ajustes: `maxSide` (1280) y `minSide` (640).

El OCR lee a mayor resolución que el análisis base (que reduce a 512 px) para no perder texto pequeño.
Tarda del orden de 1 a 3 s por imagen; con `concurrency` alta cada worker carga su propio Tesseract (memoria).

## Fotos vs ilustraciones / pixel art
`kind` clasifica cada imagen (`photo` | `graphic` | `pixel-art`) con heurísticas de píxeles. Rostros y objetos solo se
entrenaron con fotos, así que en `graphic` y `pixel-art` se omiten por defecto (`nonPhoto: 'skip'`); con `nonPhoto: 'run'`
se ejecutan igual. `kind.metrics` guarda las métricas crudas por si necesitas ajustar umbrales en `kindAnalyzer.ts`.
