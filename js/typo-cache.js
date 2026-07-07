const DB_NAME = "NoteredDB";
const DB_VERSION = 4; // Must match dictionary.js version
const STORE_NAME = "typo";

const KEY_PREFIX = "typoMap";

function makeCacheKey({ dictUrl, extractionMaxEntries, extractorVersion } = {}) {
  const base = `${dictUrl || "local"}|${extractionMaxEntries ?? 0}|${extractorVersion ?? 0}`;
  // simple non-crypto hash
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `${KEY_PREFIX}_v1_${h.toString(16)}`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function getCachedTypoMap(params = {}) {
  const key = makeCacheKey(params);

  // localStorage fallback first (fast for already cached)
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }

  // IndexedDB
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedTypoMap(typoMap, params = {}) {
  if (!typoMap || typeof typoMap !== "object") return;
  const key = makeCacheKey(params);

  // localStorage fallback
  try {
    localStorage.setItem(key, JSON.stringify(typoMap));
  } catch {
    // ignore quota errors
  }

  // IndexedDB
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(typoMap, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore cache failures
  }
}
