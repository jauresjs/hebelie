/** Persist portrait + pending flag across OAuth redirect (sessionStorage is too small for JPEG). */
export const STAGE_META_KEY = "hebelie-stage";

const DB_NAME = "hebelie";
const DB_VERSION = 1;
const PHOTO_KEY = "portrait";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
    };
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveStage({ photo, treatments, pending }) {
  if (photo) await idbSet(PHOTO_KEY, photo);
  else await idbDel(PHOTO_KEY);
  sessionStorage.setItem(
    STAGE_META_KEY,
    JSON.stringify({
      treatments,
      pending: Boolean(pending),
      hasPhoto: Boolean(photo),
    })
  );
}

export async function loadStage() {
  const raw = sessionStorage.getItem(STAGE_META_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(STAGE_META_KEY);
  let meta;
  try {
    meta = JSON.parse(raw);
  } catch {
    return null;
  }
  let photo = null;
  if (meta.hasPhoto) {
    photo = await idbGet(PHOTO_KEY);
    await idbDel(PHOTO_KEY);
  }
  return { photo, treatments: meta.treatments, pending: meta.pending };
}

export function peekPending() {
  try {
    const raw = sessionStorage.getItem(STAGE_META_KEY);
    if (!raw) return false;
    return Boolean(JSON.parse(raw).pending);
  } catch {
    return false;
  }
}
