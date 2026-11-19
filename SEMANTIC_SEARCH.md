# ImageData.js v0.7 — Visual Similarity

La v0.7 implementa la infraestructura de embeddings, no incluye un modelo CLIP ni descarga pesos automáticamente. Para similitud semántica real se debe conectar un proveedor que genere vectores de imagen y texto **en el mismo espacio vectorial**, con el mismo modelo y versión.

```ts
import { VisualIndex, embedImage, embedText, type EmbeddingProvider } from 'image-data.js';

// Implementa este adaptador con tu modelo local o servicio autorizado.
declare const provider: EmbeddingProvider;
declare const file: File;
const index = new VisualIndex();
index.add(await embedImage(provider, file, 'pin-123'));
const vector = await embedText(provider, 'ciudad futurista de noche');
const results = index.search(vector, { modelId: provider.modelId, limit: 20 });
```

Para buscar por imagen de referencia, llama `provider.embedImage(referenceFile)` y usa ese vector en `index.search`.

Combina atributos tradicionales con `index.searchFiltered(vector, options, descriptors, {orientation:'portrait', colorName:'blue'})`.

Persistencia: `JSON.stringify(index.exportRecords())`; al recuperar: `VisualIndex.fromRecords(JSON.parse(serialized))`. Almacena los datos en IndexedDB o backend desde tu aplicación. Reindexa si cambia el modelo. No mezcles embeddings de modelos diferentes aunque tengan igual dimensión.

El índice usa búsqueda exacta O(n·d), no ANN. En bibliotecas muy grandes será necesario HNSW/índice vectorial. `imageId` debe coincidir con `descriptor.id` al combinar filtros. Las imágenes no analizadas con un modelo no aparecen en los resultados de ese modelo.
