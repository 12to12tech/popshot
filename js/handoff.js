// ---------------------------------------------------------------------------
// Popshot — landing → editor file handoff via IndexedDB
// The landing page stores the dropped File; the editor picks it up on load.
// ---------------------------------------------------------------------------

const DB = 'popshot', STORE = 'handoff';

function open() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function stashFile(file) {
  const db = await open();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, 'pending');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function takeFile() {
  const db = await open();
  const file = await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const get = tx.objectStore(STORE).get('pending');
    get.onsuccess = () => { tx.objectStore(STORE).delete('pending'); res(get.result || null); };
    get.onerror = () => rej(get.error);
  });
  db.close();
  return file;
}
