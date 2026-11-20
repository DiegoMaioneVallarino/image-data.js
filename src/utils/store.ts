import type { ImageDescriptor } from '../core/types';
import { migrate } from '../core/schema';

export interface StoredImage { id: string; descriptor: ImageDescriptor; thumbnail: Blob }

const DB = 'imagedata-index', STORE = 'images';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  });
}

/** Migra lo que se pueda al esquema vigente; `stale` cuenta los registros irrecuperables. */
export async function loadAll(): Promise<{ items: StoredImage[]; stale: number }> {
  const all = ((await tx<StoredImage[]>('readonly', s => s.getAll())) ?? []);
  const items = all.flatMap(r => { const descriptor = migrate(r.descriptor); return descriptor ? [{ ...r, descriptor }] : []; });
  return { items, stale: all.length - items.length };
}
export const putMany = (items: StoredImage[]) => tx('readwrite', s => { items.forEach(i => s.put(i)); });
export const removeOne = (id: string) => tx('readwrite', s => { s.delete(id); });
export const clearAll = () => tx('readwrite', s => { s.clear(); });

/** Update annotations without replacing the thumbnail or other descriptor fields. */
export async function updateStoredAnnotations(id: string, annotations: import('../annotations/engine').ImageAnnotation[]): Promise<void> {
  const db=await open();
  await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite');
    const store=transaction.objectStore(STORE);
    const request=store.get(id);
    request.onsuccess=()=>{
      const row=request.result as StoredImage|undefined;
      if(row)store.put({...row,descriptor:{...row.descriptor,annotations}});
    };
    transaction.oncomplete=()=>resolve();
    transaction.onerror=transaction.onabort=()=>reject(transaction.error);
  }).finally(()=>db.close());
}
