<!-- à mettre dans le même dossier que admin.html -->
<script type="module" src="storage-adapter.js"></script>
// storage-adapter.js  — Backend de stockage pour ton site (IndexedDB + fallback + sauvegarde disque)
const DB_NAME = 'quizApp';
const STORE = 'kv'; // clé/valeur: students, studentsByClass, quizzes, historiqueParties, lastGameResults, lastExportAt, backupDir, etc.

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const st = tx.objectStore(STORE);
    Promise.resolve(fn(st)).then(res => {
      tx.oncomplete = () => resolve(res);
      tx.onerror = () => reject(tx.error);
    }).catch(reject);
  });
}

async function get(k) {
  const val = await withStore('readonly', st => new Promise((res, rej) => {
    const r = st.get(k); r.onsuccess = () => res(r.result ? r.result.v : undefined); r.onerror = () => rej(r.error);
  }));
  if (val === undefined) {
    // fallback legacy localStorage
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : undefined;
  }
  return val;
}
async function set(k, v) {
  await withStore('readwrite', st => st.put({ k, v }));
}
async function getMany(keys) {
  const o = {};
  for (const k of keys) o[k] = await get(k);
  return o;
}
async function keys() {
  const arr = await withStore('readonly', st => new Promise(res => {
    const out = [];
    st.openKeyCursor().onsuccess = e => {
      const c = e.target.result; if (c) { out.push(c.key); c.continue(); } else res(out);
    };
  }));
  return arr || [];
}
async function all() {
  const out = {};
  const ks = await keys();
  for (const k of ks) out[k] = await get(k);
  return out;
}

/* Quota & persistance */
async function estimate() {
  if (!navigator.storage?.estimate) return { usage: null, quota: null, persisted: false };
  const { usage, quota } = await navigator.storage.estimate();
  const persisted = await navigator.storage.persisted?.() ?? false;
  return { usage, quota, persisted };
}
async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}

/* Sauvegarde disque (Chrome/Edge) */
async function chooseBackupDir() {
  if (!window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await set('backupDir', handle);
  return handle;
}
async function backupToDir(data) {
  let handle = await get('backupDir');
  if (!handle) handle = await chooseBackupDir();
  if (!handle) throw new Error('Aucun dossier choisi / API non supportée.');
  const file = await handle.getFileHandle(`backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`, { create: true });
  const ws = await file.createWritable();
  await ws.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  await ws.close();
}

/* Export/Import */
async function exportJSON() {
  const payload = await all();
  try { await backupToDir(payload); return { to: 'folder' }; } catch {
    // fallback: téléchargement classique
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    return { to: 'download' };
  } finally {
    await set('lastExportAt', new Date().toISOString());
  }
}
async function importJSONFile(file) {
  const txt = await file.text();
  const data = JSON.parse(txt);
  for (const [k, v] of Object.entries(data)) await set(k, v);
}

/* Migration depuis localStorage */
async function migrateFromLocalStorage() {
  const keys = ['students','studentsByClass','quizzes','historiqueParties','lastGameResults','lastExportAt'];
  let moved = 0;
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (raw) { await set(k, JSON.parse(raw)); moved++; }
  }
  return moved;
}

/* Maintenance */
async function purgeOldGames(days) {
  const cut = Date.now() - days*24*3600*1000;
  const games = (await get('historiqueParties')) || [];
  const keep = games.filter(g => new Date(g.date || g.createdAt || 0).getTime() >= cut);
  await set('historiqueParties', keep);
  return { removed: games.length - keep.length, kept: keep.length };
}

/* API publique */
const DB = {
  get, set, getMany, all, keys,
  estimate, requestPersistence,
  exportJSON, importJSONFile, chooseBackupDir,
  migrateFromLocalStorage, purgeOldGames
};
export default DB;
