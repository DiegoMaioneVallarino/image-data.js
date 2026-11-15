import { useState } from 'react';
import { analyzeBatch } from './core/pipeline';
import { searchImages } from './search/queryEngine';
import type { ImageDescriptor, Orientation } from './core/types';
import './App.css';
type Entry = { descriptor: ImageDescriptor; url: string };
export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation | ''>('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const filtered = searchImages(entries.map(e => e.descriptor), { orientation: orientation || undefined });
  const visible = entries.filter(e => filtered.includes(e.descriptor));
  const active = entries.find(e => e.descriptor.id === selected)?.descriptor;
  async function add(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter(f => f.type.startsWith('image/'));
    setBusy(true);
    try {
      const descriptors = await analyzeBatch(images, (n, total) => setProgress(`${n}/${total}`));
      const next = descriptors.map((descriptor, i) => ({ descriptor, url: URL.createObjectURL(images[i]) }));
      setEntries(old => [...old, ...next]);
      if (next.length) setSelected(next[0].descriptor.id);
    } catch (e) { alert(e instanceof Error ? e.message : 'Error analizando imagen'); }
    finally { setBusy(false); setProgress(''); }
  }
  function download(data: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main>
    <header><div><h1>ImageData.js</h1><p>Visual analysis laboratory · v0.1.0</p></div><span>{entries.length} imágenes analizadas</span></header>
    <section className="toolbar"><label className="upload">{busy ? `Analizando ${progress}` : '+ Cargar imágenes'}<input type="file" accept="image/*" multiple disabled={busy} onChange={e => { void add(e.target.files); e.target.value = ''; }} /></label>
      <select value={orientation} onChange={e => setOrientation(e.target.value as Orientation | '')}><option value="">Todas las orientaciones</option><option value="portrait">Vertical</option><option value="landscape">Horizontal</option><option value="square">Cuadrada</option></select>
      <button disabled={!entries.length} onClick={() => download(entries.map(e => e.descriptor), 'image-data-index.json')}>Exportar índice JSON</button>
    </section>
    <div className="layout"><section className="gallery">{visible.length === 0 && <p className="empty">Carga imágenes para comenzar el análisis.</p>}{visible.map(e => <button key={e.descriptor.id} className={`tile ${selected === e.descriptor.id ? 'active' : ''}`} onClick={() => setSelected(e.descriptor.id)}><img src={e.url} alt={e.descriptor.filename} /><strong>{e.descriptor.filename}</strong><small>{e.descriptor.metadata.width} × {e.descriptor.metadata.height}</small></button>)}</section>
    <aside><h2>Descriptor</h2>{active ? <><h3>{active.filename}</h3><div className="swatches">{active.colors.dominant.map((c, i) => <div key={i} title={`${c.hex} · ${c.percent}%`} style={{ background: c.hex }} />)}</div><p>Brillo: {active.lighting.brightness}</p><p>Contraste: {active.lighting.contrast}</p><p>Saturación: {active.colors.saturation}</p><p>Bordes: {active.geometry.edgeDensity}</p><button onClick={() => download(active, `${active.filename}.json`)}>Descargar JSON</button><pre>{JSON.stringify(active, null, 2)}</pre></> : <p>Selecciona una imagen.</p>}</aside></div>
  </main>;
}
