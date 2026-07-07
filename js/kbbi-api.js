/**
 * kbbi-api.js - GitHub-backed KBBI dictionary definition lookup
 *
 * This module fetches definitions from a GitHub-hosted dataset.
 * Because GitHub does not provide an official public "KBBI API",
 * the best "API" that works in a static frontend is exposing a JSON
 * dataset in a GitHub repository and fetching it via raw URLs.
 *
 * IMPORTANT:
 * - Configure REPO_RAW_URLS to match the repository you want to use.
 * - Format expected:
 *   - word -> { def: string | string[], pos?: string, examples?: string[] }
 *   - or word -> string
 */

const DEFAULT_DEFINITION_FALLBACK = {
  def: null,
  pos: null,
  examples: [],
};

const LOCAL_DICT_URL = "./data/dictionary__JSON.json";

const CACHE_DB_NAME = "NoteredDB";
const CACHE_DB_VERSION = 3;
const CACHE_STORE_NAME = "kbbi_defs";
const CACHE_KEY_PREFIX = "def_";

function _normalizeWord(word) {
  return (word || "").trim().toLowerCase();
}

function _openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(request.error);
  });
}

async function _getCached(word) {
  const key = CACHE_KEY_PREFIX + word;
  try {
    const db = await _openDB();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE_NAME, "readonly");
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function _setCached(word, payload) {
  const key = CACHE_KEY_PREFIX + word;
  try {
    const db = await _openDB();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const req = store.put(payload, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore cache failures
  }
}


async function _fetchAllDefinitionsOnce() {
  // Local-only source (as requested)
  const res = await fetch(LOCAL_DICT_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load KBBI definitions from local: ${LOCAL_DICT_URL} (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data || typeof data !== "object") {
    throw new Error("KBBI local definitions payload is not an object");
  }
  return data;
}

let _definitionsIndexPromise = null;
async function _getDefinitionsIndex() {
  if (!_definitionsIndexPromise) {
    _definitionsIndexPromise = _fetchAllDefinitionsOnce();
  }
  return _definitionsIndexPromise;
}

export class KbbiApi {
  /**
   * Lookup a word definition.
   * @param {string} word
   * @returns {Promise<{def: string|null,pos?:string|null,examples?:string[]}>}
   */
  static async lookup(word) {
    const w = _normalizeWord(word);
    if (!w) return { ...DEFAULT_DEFINITION_FALLBACK };

    const cached = await _getCached(w);
    if (cached) return cached;

    // Load (or fetch) the whole index once.
    // This is acceptable for small datasets; if the dataset is huge,
    // switch to a per-word endpoint.
    const index = await _getDefinitionsIndex();

    const entry = index[w];
    if (!entry) {
      const empty = { ...DEFAULT_DEFINITION_FALLBACK };
      empty.def = null;
      await _setCached(w, empty);
      return empty;
    }

    let payload;
    if (typeof entry === "string") {
      payload = { ...DEFAULT_DEFINITION_FALLBACK, def: entry };
    } else {
      // Normalize different possible shapes
      const def = entry.def ?? entry.definition ?? entry.arti ?? entry.meaning ?? null;
      const pos = entry.pos ?? entry.partOfSpeech ?? null;
      const examples = entry.examples ?? entry.contoh ?? [];

      payload = {
        def: Array.isArray(def) ? def.join("; ") : def,
        pos,
        examples: Array.isArray(examples) ? examples : [],
      };
    }

    await _setCached(w, payload);
    return payload;
  }
}
