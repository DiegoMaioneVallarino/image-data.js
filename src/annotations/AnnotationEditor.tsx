import { useEffect, useRef, useState } from 'react';
import type { ImageAnnotation, Point } from './engine';
import { addAnnotation, analyzeAnnotation, boxFromPoints, removeAnnotation } from './engine';
import type { RawImage } from '../core/types';

interface Props { url: string; annotations: ImageAnnotation[]; onChange: (items: ImageAnnotation[]) => void }
const pointFromEvent = (e: React.PointerEvent<SVGSVGElement>): Point => {
  const rect=e.currentTarget.getBoundingClientRect();
  return { x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)), y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height)) };
};
export function AnnotationEditor({url,annotations,onChange}:Props) {
  const [mode,setMode]=useState<'box'|'polygon'>('box');
  const [label,setLabel]=useState('persona');
  const [parentId,setParentId]=useState('');
  const [start,setStart]=useState<Point|null>(null);
  const [cursor,setCursor]=useState<Point|null>(null);
  const [points,setPoints]=useState<Point[]>([]);
  const [selected,setSelected]=useState('');
  const [error,setError]=useState('');
  const [raw,setRaw]=useState<RawImage|null>(null);
  const svg=useRef<SVGSVGElement>(null);
  useEffect(()=>{ let alive=true; const img=new Image(); img.onload=()=>{
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx)return;
    ctx.drawImage(img,0,0);try {const data=ctx.getImageData(0,0,canvas.width,canvas.height);if(alive)setRaw(data);} catch {if(alive)setError('No se pudo leer la imagen');}
  };img.src=url;return()=>{alive=false;}; },[url]);
  useEffect(()=>{setStart(null);setCursor(null);setPoints([]);setSelected('');},[url]);
  function create(geometry: ImageAnnotation['geometry']) {
    try {
      const annotation: ImageAnnotation={id:crypto.randomUUID(),label:label.trim(),...(parentId?{parentId}:{}),source:'human',geometry,createdAt:new Date().toISOString()};
      if(raw) annotation.visual=analyzeAnnotation(raw,geometry,{paletteSize:6,gridSize:2,maxSamples:4000});
      onChange(addAnnotation(annotations,annotation));setSelected(annotation.id);setError('');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  function down(e: React.PointerEvent<SVGSVGElement>){
    if(mode!=='box')return; const p=pointFromEvent(e);setStart(p);setCursor(p);e.currentTarget.setPointerCapture(e.pointerId);
  }
  function up(e: React.PointerEvent<SVGSVGElement>){
    if(!start)return; const g=boxFromPoints(start,pointFromEvent(e));setStart(null);setCursor(null);
    if(g.width>0.005&&g.height>0.005)create(g);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function finishPolygon(){if(points.length>=3)create({type:'polygon',points});setPoints([]);}
  const active=annotations.find(a=>a.id===selected);
  return <section className="annotation-editor">
    <h3>Annotation Engine · v0.9.2</h3>
    <p>Dibuja cajas arrastrando o polígonos pulsando sus vértices. Los colores se calculan dentro de la selección.</p>
    <div className="annotation-fields">
      <select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setPoints([]);setStart(null);}}><option value="box">Rectángulo</option><option value="polygon">Polígono</option></select>
      <input aria-label="Etiqueta de entidad" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Etiqueta: persona, boca..." />
      <select aria-label="Entidad padre" value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">Sin padre</option>{annotations.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select>
    </div>
    <div className="annotation-stage">
      <img src={url} alt="Imagen para anotar" draggable={false}/>
      <svg ref={svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={down} onPointerMove={e=>{if(start)setCursor(pointFromEvent(e));}} onPointerUp={up} onClick={e=>{if(mode==='polygon')setPoints(old=>[...old,pointFromEvent(e)]);}}>
        {annotations.map(a=>a.geometry.type==='box' ? <rect key={a.id} x={a.geometry.x*1000} y={a.geometry.y*1000} width={a.geometry.width*1000} height={a.geometry.height*1000} fill={selected===a.id?'#38bdf833':'#facc1518'} stroke={selected===a.id?'#38bdf8':'#facc15'} strokeWidth="4" pointerEvents="none"/>:<polygon key={a.id} points={a.geometry.points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')} fill={selected===a.id?'#38bdf833':'#facc1518'} stroke={selected===a.id?'#38bdf8':'#facc15'} strokeWidth="4" pointerEvents="none"/>)}
        {start&&cursor&&(()=>{const g=boxFromPoints(start,cursor);return <rect x={g.x*1000} y={g.y*1000} width={g.width*1000} height={g.height*1000} fill="#38bdf833" stroke="#38bdf8" strokeWidth="4" pointerEvents="none"/>})()}
        {points.length>0&&<polyline points={points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')} stroke="#38bdf8" strokeWidth="4" fill="none" pointerEvents="none"/>}
      </svg>
    </div>
    {mode==='polygon'&&<div className="annotation-fields"><button disabled={points.length<3} onClick={finishPolygon}>Cerrar polígono ({points.length} puntos)</button><button onClick={()=>setPoints([])}>Cancelar polígono</button></div>}
    {error&&<p role="alert" className="annotation-error">{error}</p>}
    <div className="annotation-list">{annotations.map(a=><div key={a.id} className="annotation-item"><button onClick={()=>setSelected(a.id)}>{a.id===selected?'● ':'○ '}{a.label}{a.parentId?' ↳':''} · {a.geometry.type}</button><button title="Eliminar anotación y descendientes" onClick={()=>{onChange(removeAnnotation(annotations,a.id));if(selected===a.id)setSelected('');if(parentId===a.id)setParentId('');}}>Eliminar</button></div>)}</div>
    {active&&<div className="annotation-metrics"><strong>{active.label}</strong><p>Brillo medio: {active.visual?.light.mean.toFixed(3)??'sin análisis'} · {active.visual?.sampleCount??0} muestras</p><div className="annotation-swatches">{active.visual?.palette.map(c=><span key={c.hex} title={`${c.hex} · ${(c.coverage*100).toFixed(1)}%`} style={{background:c.hex,flex:c.coverage}}/>)}</div><small>Paleta perceptual de la región · transparencia fuera de la selección</small></div>}
  </section>;
}
