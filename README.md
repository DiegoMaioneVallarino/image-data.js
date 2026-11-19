# ImageData.js v0.5.0

Librería TypeScript de análisis visual para navegador y núcleo de análisis de píxeles compatible con Node.js. Incluye laboratorio React independiente.

## Instalación de desarrollo

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build:lib
```

## Usar en Empireterest sin publicar en npm

Desde `image-data.js`, ejecutar `npm run build:lib` y luego `npm pack` (crea un `.tgz`). En Empireterest:

```bash
npm install ../image-data.js/image-data.js-0.5.0.tgz
```

La ruta es un ejemplo: ajustar a la ubicación real del `.tgz`.

```ts
import { analyzeFile, rankImages } from 'image-data.js';

const { descriptor, thumbnail, warnings } = await analyzeFile(file);
const hits = rankImages([descriptor], { orientation: 'portrait' });
```

`analyzeFile` requiere APIs de imagen del navegador. `analyzePixels` admite un objeto de píxeles en Node.js. Los modelos ONNX y OCR requieren configuración y recursos externos; no se activan por defecto.

## API pública

`analyzeImage`, `analyzeFile`, `analyzePixels`, `analyzeBatch`, `searchImages`, `rankImages`, detectores opcionales y tipos del descriptor. El worker se distribuye como `dist/analyzer.worker.js` junto al módulo.

## Limitaciones

- La búsqueda usa descriptores en memoria; IndexedDB existe en el laboratorio, pero no es un índice persistente de pins de Empireterest.
- El worker y las rutas de modelos deben probarse en la aplicación consumidora tras instalar el paquete.
- No se incluyen modelos ONNX ni idiomas OCR offline.
- El esquema de descriptores permanece en `0.4.0`: la versión `0.5.0` corresponde al paquete, no a un cambio de esquema.

## v0.6 Spatial Search

See [SPATIAL_SEARCH.md](SPATIAL_SEARCH.md) for spatial filters, object relationships and usage examples.
