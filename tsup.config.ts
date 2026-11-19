import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'analyzer.worker': 'src/core/analyzer.worker.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  external: ['onnxruntime-web', 'tesseract.js'],
});
