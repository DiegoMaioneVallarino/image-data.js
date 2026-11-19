import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeBatch } from './core/pipeline';
import { isImageFile } from './utils/imageLoader';
import { rankImages, type ImageQuery } from './search/queryEngine';
import { clearAll, loadAll, putMany, removeOne } from './utils/store';
import type { FaceOptions } from './analyzers/faces/faceAnalyzer';
import type { ObjectOptions } from './analyzers/objects/objectAnalyzer';
import type { TextOptions } from './analyzers/text/textAnalyzer';
import { SCHEMA_VERSION } from './core/schema';
import type { ColorName, ImageDescriptor, ImageKind, Orientation, Temperature } from './core/types';
import './App.css';

type Entry = { descriptor: ImageDescriptor; url: string };
// Coloca version-RFB-320.onnx en public/models/. Sin el archivo todo funciona salvo rostros.
const FACES: FaceOptions = { modelUrl: '/models/version-RFB-320.onnx' };
// Coloca ssd_mobilenet_v1_12.onnx en public/models/. Sin el archivo todo funciona salvo objetos.
const OBJECTS: ObjectOptions = { modelUrl: '/models/ssd_mobilenet_v1_12.onnx' };
// OCR con Tesseract.js: descarga el motor y los idiomas desde su CDN la primera vez (ver models/README.md para usarlo sin internet).
const TEXT: TextOptions = { languages: 'eng+spa' };
const COLORS: ColorName[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'gray'];

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation | ''>('');
  const [colorName, setColorName] = useState<ColorName | ''>('');
  const [temperature, setTemperature] = useState<Temperature | ''>('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ImageKind | ''>('');
  const [withText, setWithText] = useState(false);
  const [faceFilter, setFaceFilter] = useState<'' | '0' | '1' | '2+'>('');
  const [sortBy, setSortBy] = useState<NonNullable<ImageQuery['sortBy']>>('relevance');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const urls = useRef(new Set<string>());

  const makeUrl = (blob: Blob) => { const u = URL.createObjectURL(blob); urls.current.add(u); return u; };
  const freeUrl = (u: string) => { URL.revokeObjectURL(u); urls.current.delete(u); };

  // Restaura el índice guardado y libera todas las object URLs al desmontar.
  useEffect(() => {
    let alive = true;
    loadAll().then(({ items, stale }) => {
      if (!alive) return;
      setEntries(items.map(r => ({ descriptor: r.descriptor, url: makeUrl(r.thumbnail) })));
      if (stale) setErrors([`${stale} imagen(es) guardadas con un esquema antiguo se omitieron; vuelve a cargarlas.`]);
    }).catch(() => setErrors(['No se pudo leer el índice guardado (IndexedDB no disponible).']));
    const live = urls.current;
    return () => { alive = false; live.forEach(u => URL.revokeObjectURL(u)); live.clear(); };
  }, []);

  const query: ImageQuery = { text: text || undefined, kind: kind || undefined, hasText: withText ? true : undefined, orientation: orientation || undefined, colorName: colorName || undefined, temperature: temperature || undefined, sortBy,
    ...(faceFilter === '0' ? { minFaces: 0, maxFaces: 0 } : faceFilter === '1' ? { minFaces: 1, maxFaces: 1 } : faceFilter === '2+' ? { minFaces: 2 } : {}) };
  const visible = useMemo(() => {
    const byId = new Map(entries.map(e => [e.descriptor.id, e]));
    return rankImages(entries.map(e => e.descriptor), query).map(h => byId.get(h.descriptor.id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, text, kind, withText, orientation, colorName, temperature, faceFilter, sortBy]);
  const active = entries.find(e => e.descriptor.id === selected)?.descriptor;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    // Se acepta por MIME o por extensión (.avif/.jfif llegan a veces con type vacío) y se AVISA de lo omitido.
    const all = Array.from(files);
    const images = all.filter(isImageFile);
    const skipped = all.filter(f => !isImageFile(f)).map(f => `${f.name}: omitido, no se reconoce como imagen (tipo "${f.type || 'vacío'}").`);
    if (!images.length) { setErrors(skipped.length ? skipped : ['No se seleccionó ninguna imagen.']); return; }
    setBusy(true); setErrors(skipped); setProgress(`0/${images.length} · la primera vez carga los modelos`);
    try {
      const { ok, failed, warnings } = await analyzeBatch(images, { faces: FACES, objects: OBJECTS, text: TEXT, onProgress: (n, total) => setProgress(`${n}/${total}`) });
      const next = ok.map(a => ({ descriptor: a.descriptor, url: makeUrl(a.thumbnail) }));
      setEntries(old => [...old, ...next]);
      if (next.length) setSelected(next[0].descriptor.id);
      setErrors([...skipped, ...warnings, ...failed.map(f => f.error.startsWith(f.file.name) ? f.error : `${f.file.name}: ${f.error}`)]);
      await putMany(ok.map(a => ({ id: a.descriptor.id, descriptor: a.descriptor, thumbnail: a.thumbnail })))
        .catch(() => setErrors(e => [...e, 'No se pudo guardar el índice; seguirá solo en memoria.']));
    } finally { setBusy(false); setProgress(''); }
  }

  function remove(id: string) {
    const e = entries.find(x => x.descriptor.id === id);
    if (e) freeUrl(e.url);
    setEntries(old => old.filter(x => x.descriptor.id !== id));
    if (selected === id) setSelected(null);
    void removeOne(id);
  }
  function clear() {
    urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current.clear();
    setEntries([]); setSelected(null); void clearAll();
  }
  function download(data: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main>
    <header><div><h1>ImageData.js</h1><p>Visual analysis laboratory · v{SCHEMA_VERSION}</p></div><span>{entries.length} imágenes analizadas · {visible.length} visibles</span></header>
    <section className="toolbar">
      <label className="upload">{busy ? `Analizando ${progress}` : '+ Cargar imágenes'}<input type="file" accept="image/*,.avif,.jfif,.webp,.bmp,.svg,.gif,.tif,.tiff" multiple disabled={busy} onChange={e => { void add(e.target.files); e.target.value = ''; }} /></label>
      <input type="search" className="search" placeholder="Buscar: perro, persona, luminosa…" value={text} onChange={e => setText(e.target.value)} />
      <select value={kind} onChange={e => setKind(e.target.value as ImageKind | '')}><option value="">Cualquier tipo</option><option value="photo">Foto</option><option value="graphic">Ilustración / gráfico</option><option value="pixel-art">Pixel art</option></select>
      <label className="check"><input type="checkbox" checked={withText} onChange={e => setWithText(e.target.checked)} /> Con texto</label>
      <select value={orientation} onChange={e => setOrientation(e.target.value as Orientation | '')}><option value="">Todas las orientaciones</option><option value="portrait">Vertical</option><option value="landscape">Horizontal</option><option value="square">Cuadrada</option></select>
      <select value={colorName} onChange={e => setColorName(e.target.value as ColorName | '')}><option value="">Cualquier color</option>{COLORS.map(c => <option key={c} value={c}>{c}</option>)}</select>
      <select value={temperature} onChange={e => setTemperature(e.target.value as Temperature | '')}><option value="">Cualquier temperatura</option><option value="warm">Cálida</option><option value="cool">Fría</option><option value="neutral">Neutra</option></select>
      <select value={faceFilter} onChange={e => setFaceFilter(e.target.value as typeof faceFilter)}><option value="">Rostros: cualquiera</option><option value="0">Sin rostros</option><option value="1">Un rostro</option><option value="2+">2 o más</option></select>
      <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}><option value="relevance">Relevancia</option><option value="newest">Más recientes</option><option value="brightness">Brillo</option><option value="saturation">Saturación</option></select>
      <button disabled={!entries.length} onClick={() => download(entries.map(e => e.descriptor), 'image-data-index.json')}>Exportar índice JSON</button>
      <button disabled={!entries.length} onClick={clear}>Vaciar índice</button>
    </section>
    {errors.length > 0 && <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    <div className="layout">
      <section className="gallery">{visible.length === 0 && <p className="empty">{entries.length ? 'Ninguna imagen cumple los filtros.' : 'Carga imágenes para comenzar el análisis.'}</p>}
        {visible.map(e => <button key={e.descriptor.id} className={`tile ${selected === e.descriptor.id ? 'active' : ''}`} onClick={() => setSelected(e.descriptor.id)}>
          <img src={e.url} alt={e.descriptor.filename} /><strong>{e.descriptor.filename}</strong><small>{e.descriptor.metadata.width} × {e.descriptor.metadata.height} · {e.descriptor.colors.dominantName}</small></button>)}
      </section>
      <aside><h2>Descriptor</h2>{active ? <>
        <h3>{active.filename}</h3>
        <div className="swatches">{active.colors.dominant.map((c, i) => <div key={i} title={`${c.hex} · ${c.name} · ${c.percent}%`} style={{ background: c.hex }} />)}</div>
        <p>Color dominante: {active.colors.dominantName} · {active.colors.temperature}</p>
        <p>Brillo: {active.lighting.brightness}</p><p>Contraste: {active.lighting.contrast}</p>
        <p>Saturación: {active.colors.saturation}</p><p>Bordes: {active.geometry.edgeDensity}</p>
        {active.caption && <p className="caption">{active.caption}</p>}
        {active.tags && active.tags.length > 0 && <div className="tags">{active.tags.map(t => <button key={t} onClick={() => setText(t)}>{t}</button>)}</div>}
        <p>Tipo: {active.kind ? `${active.kind.type}${active.kind.metrics.blockSize > 1 ? ` (píxel ×${active.kind.metrics.blockSize})` : ''}` : 'sin analizar'}</p>
        <p>Texto: {active.text ? (active.text.count ? `${active.text.count} palabras · ${(active.text.coverage * 100).toFixed(1)}% de la imagen` : 'ninguno') : 'sin analizar'}</p>
        <p>Objetos: {active.objects ? (active.objects.count ? Object.entries(active.objects.counts).map(([c, n]) => `${c} ×${n}`).join(', ') : 'ninguno') : 'sin analizar'}</p>
        <p>Rostros: {active.faces ? `${active.faces.count}${active.faces.count ? ` · mayor ${(active.faces.largestAreaRatio * 100).toFixed(1)}%` : ''}` : 'sin analizar'}</p>
        <button onClick={() => download(active, `${active.filename}.json`)}>Descargar JSON</button>{' '}
        <button onClick={() => remove(active.id)}>Quitar del índice</button>
        <pre>{JSON.stringify(active, null, 2)}</pre></> : <p>Selecciona una imagen.</p>}</aside>
    </div>
  </main>;
}
