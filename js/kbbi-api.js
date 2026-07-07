/**
 * kbbi-api.js - KBBI Dictionary Definition Lookup
 *
 * Fetches definitions from the local dictionary__JSON.json dataset.
 * The dataset format is: { "dictionary": [ { word, arti, type }, ... ] }
 *
 * This module builds an index on first load and caches it in IndexedDB
 * for subsequent lookups.
 *
 * Definitions returned by lookup() are validated and formatted using the
 * shared KBBI validator + parser so they stay consistent with the rest of
 * the system (pipeline: validate -> parse -> format).
 */

import { kbbiValidator } from "./kbbi-validator.js";
import { kbbiParser } from "./kbbi-parser.js";

const DEFAULT_DEFINITION_FALLBACK = {
  def: null,
  pos: null,
  examples: [],
  raw: null,
  isIncomplete: false,
};

const LOCAL_DICT_URL = "./data/dictionary__JSON.json";

const CACHE_DB_NAME = "NoteredDB";
const CACHE_DB_VERSION = 4; // Must match dictionary.js
const CACHE_STORE_NAME = "kbbi_defs";
const CACHE_KEY_PREFIX = "def_v2_";

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
    request.onerror = (e) => reject(e.target.error);
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

/**
function _buildDefinitionIndex(dictArray) {
  const index = new Map();
  
  for (const entry of dictArray) {
    const word = _normalizeWord(entry.word);
    if (!word) continue;

    const existing = index.get(word);
    const newEntry = {
      def: entry.arti || null,
      pos: entry.type ? `Tipe ${entry.type}` : null,
      type: entry.type,
    };

    if (!existing) {
      index.set(word, newEntry);
    } else {
      // Merge: concatenate definitions for words with multiple entries
      const combinedDef = existing.def 
        ? `${existing.def}\n\n${newEntry.def}` 
        : newEntry.def;
      index.set(word, {
        ...existing,
        def: combinedDef,
      });
    }
  }

  return index;
}

async function _fetchAllDefinitionsOnce() {
  // Local-only source (as requested)
  const res = await fetch(LOCAL_DICT_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load KBBI definitions from local: ${LOCAL_DICT_URL} (HTTP ${res.status})`);
  }
  const data = await res.json();
  
  // Handle dictionary__JSON.json format: { "dictionary": [ ... ] }
  const dictArray = Array.isArray(data?.dictionary) ? data.dictionary : [];
  if (!dictArray.length) {
    throw new Error("KBBI local definitions payload is empty or invalid");
  }

  return _buildDefinitionIndex(dictArray);
}

let _definitionsIndexPromise = null;
async function _getDefinitionsIndex() {
  if (!_definitionsIndexPromise) {
    _definitionsIndexPromise = _fetchAllDefinitionsOnce();
  }
  return _definitionsIndexPromise;
}

/**
 * Validate + format a raw KBBI definition string through the shared
 * validator -> parser pipeline. Returns { def, raw, isIncomplete }.
 * @param {string|null} rawDef
 * @returns {{def: string|null, raw: string|null, isIncomplete: boolean}}
 */
function _processDefinition(rawDef) {
  if (!rawDef) {
    return { def: null, raw: null, isIncomplete: false };
  }

  // 1. Validate / fix formatting (HTML decode, spacing cleanup, etc.)
  const validation = kbbiValidator.validate(rawDef);

  // 2. Parse + format into clean, human-readable text
  const parsed = kbbiParser.parse(validation.fixedText);
  const formatted = parsed ? kbbiParser.format(parsed) : validation.fixedText;

  return {
    def: formatted || validation.fixedText || null,
    raw: rawDef,
    isIncomplete: validation.isIncomplete,
  };
}

export class KbbiApi {
  /**
   * Lookup a word definition.
   * @param {string} word
   * @returns {Promise<{def: string|null,pos?:string|null,examples?:string[],raw?:string|null,isIncomplete?:boolean}>}
   */
  static async lookup(word) {
    const w = _normalizeWord(word);
    if (!w) return { ...DEFAULT_DEFINITION_FALLBACK };

    const cached = await _getCached(w);
    if (cached) return cached;

    // Load (or fetch) the whole index once.
    const index = await _getDefinitionsIndex();

    const entry = index.get(w);
    if (!entry) {
      const empty = { ...DEFAULT_DEFINITION_FALLBACK };
      empty.def = null;
      await _setCached(w, empty);
      return empty;
    }

    // Validate + format the definition through the shared pipeline.
    const processed = _processDefinition(entry.def);

    const payload = {
      def: processed.def,
      raw: processed.raw,
      pos: entry.pos,
      examples: [],
      isIncomplete: processed.isIncomplete,
    };

    await _setCached(w, payload);
    return payload;
  }
}
