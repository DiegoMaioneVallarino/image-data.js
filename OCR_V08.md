# OCR v0.8 — verificación conservadora

Se conserva Tesseract.js, sin backend Python ni modelos adicionales. Por defecto, el OCR lee la imagen original y vuelve a leerla en escala de grises; solo indexa líneas cuya transcripción y posición coinciden. Se pueden inspeccionar los rechazos y cajas confirmadas en el laboratorio React.

## Configuración

```ts
text: { languages: 'eng+spa', verification: 'conservative' }
```

Para desactivar la verificación y recuperar el comportamiento anterior: `verification: 'off'`.

**Limitaciones:** Dos pasadas del mismo motor no son evidencia independiente; pueden coincidir en un error. El modo conservador también produce falsos negativos, especialmente con texto pequeño, estilizado o de una sola palabra. No se implementó DBNet ni PaddleOCR en esta versión. Las coordenadas del diagnóstico son normalizadas. La segunda lectura aumenta el tiempo de OCR y puede agotar el timeout en equipos lentos.
