/**
 * dictionary.js — High-Performance KBBI Dictionary Engine
 *
 * Data Structures Used:
 * ─────────────────────
 * 1. Set<string>           — O(1) exact word lookup
 * 2. Trie (compressed)     — O(prefix) autocomplete traversal
 * 3. SymSpell delete index — O(maxDist·prefixLen) fuzzy candidate retrieval
 *
 * Design goals:
 * - lookup:     O(1) via Set
 * - autocomplete: O(k·prefix) via Trie DFS
 * - fuzzy search: O(k) candidate retrieval + O(k·n·m) scoring (small k)
 * - NO full-dictionary linear scans during spell check
 *
 * Loading strategy:
 * 1. IndexedDB cache → fast startup path (skips JSON parse + index build)
 * 2. Fresh fetch from ./data/dictionary__JSON.json → authoritative
 * 3. Emergency fallback set if everything fails
 *
 * SymSpell parameters:
 * - maxDistance = 2  (catches most typos: 1-2 edit operations)
 * - prefixLen   = 7  (longer prefix = smaller index, comparable accuracy)
 */

import { kbbiValidator } from './kbbi-validator.js';

// ── IndexedDB connection pool ───────────────────────────────────────────────
let _dbPromise = null;

function _getDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('NoteredDB', 4);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        ['dictionary', 'kbbi_defs', 'typo'].forEach(store => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });

  return _dbPromise;
}

// ── Constants ───────────────────────────────────────────────────────────────
const STORE_NAME             = 'dictionary';
const KEY_WORDS              = 'kbbi_words_v4';
const KEY_DEFS               = 'kbbi_defs_v4';
const SYMSPELL_MAX_DISTANCE  = 2;
const SYMSPELL_PREFIX_LEN    = 7;  // characters to use for delete key generation
const AUTOCOMPLETE_SCAN_LIMIT = 60; // max nodes to DFS before sorting

// ── Trie helpers ─────────────────────────────────────────────────────────────

function _trieNode() {
  return { c: Object.create(null), w: null };
  //            ^children map       ^terminal word
}

// ── SymSpell delete generation ────────────────────────────────────────────────

/**
 * Generate all unique "delete" variants of `word` up to `maxDist` operations.
 * Operates only on the first `prefixLen` characters for smaller index size.
 * @param {string} word
 * @param {number} maxDist
 * @param {number} prefixLen
 * @returns {Set<string>}
 */
function _generateDeletes(word, maxDist = SYMSPELL_MAX_DISTANCE, prefixLen = SYMSPELL_PREFIX_LEN) {
  const source   = word.slice(0, prefixLen);
  const deletes  = new Set();
  let frontier   = new Set([source]);

  for (let d = 0; d < maxDist; d++) {
    const next = new Set();
    for (const token of frontier) {
      if (token.length <= 1) continue;
      for (let i = 0; i < token.length; i++) {
        const del = token.slice(0, i) + token.slice(i + 1);
        if (!deletes.has(del)) {
          deletes.add(del);
          next.add(del);
        }
      }
    }
    frontier = next;
  }

  return deletes;
}

// ── Common word autocomplete priority ────────────────────────────────────────
const AUTOCOMPLETE_PRIORITY = Object.freeze(Object.assign(Object.create(null), {
  apa: 100, apabila: 95, api: 90, aplikasi: 85, apel: 80,
  ada: 70,  adalah:  68, akan: 66, atau: 64, agar: 62,
  aku: 60,  anda:    58, anak: 56, antara: 54, atas: 52,
  bisa: 50, bukan: 48, bagi: 46, baik: 44, baru: 42, benar: 40,
  cara: 38, cepat: 36, cukup: 34,
  dan: 100, dapat: 95, dalam: 90, dari: 88, dia: 85,
  hal: 50, hari: 48, harus: 46, hendak: 44,
  ini: 90, itu: 88, ingin: 80,
  juga: 75, jalan: 70, jadi: 68,
  kamu: 60, kata: 58, karena: 56, ke: 100, kerja: 50,
  lain: 45, lagi: 43, lebih: 42,
  masih: 40, maka: 38, mau: 36, mereka: 34,
  namun: 32, tidak: 100,
  oleh: 30, atau: 100, pada: 88,
  saya: 70, sudah: 65, semua: 60, sangat: 55, saat: 50,
  tapi: 45, tetapi: 43, untuk: 100, yang: 100,
}));

// ── Dictionary Class ──────────────────────────────────────────────────────────
export class Dictionary {
  constructor() {
    this._words       = new Set();       // O(1) exact lookup
    this._wordsArray  = [];              // sorted, for binary search
    this._trie        = _trieNode();     // prefix autocomplete
    this._deleteIdx   = new Map();       // SymSpell delete index
    this._definitions = new Map();       // word → { arti, type, isIncomplete }
    this._isLoaded    = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async load() {
    try {
      // 1. Warm-start from IndexedDB cache
      const [cachedWords, cachedDefs] = await Promise.all([
        this._idbGet(STORE_NAME, KEY_WORDS),
        this._idbGet(STORE_NAME, KEY_DEFS),
      ]);

      if (cachedWords && Array.isArray(cachedWords) && cachedWords.length > 0) {
        this._populate(cachedWords);
        if (cachedDefs) this._loadCachedDefs(cachedDefs);
        this._isLoaded = true;
      }

      // 2. Always attempt fresh fetch from local JSON
      try {
        const res = await fetch('./data/dictionary__JSON.json');
        if (res.ok) {
          const payload = await res.json();
          const dict    = Array.isArray(payload?.dictionary) ? payload.dictionary
            : Array.isArray(payload) ? payload : [];

          if (dict.length > 0) {
            const wordList = dict
              .map(entry => (entry?.word ?? '').toLowerCase().trim())
              .filter(Boolean);

            this._populate(wordList);
            // IMPORTANT: Reset definitions before populating from the fresh
            // authoritative source. The cached defs (loaded from IndexedDB
            // just above) are only a warm-start; merging fresh defs INTO the
            // cached map would concatenate the same definition on every reload
            // and accumulate duplicates (e.g. "Lihat enyah" ×N). The fresh
            // JSON is authoritative, so intra-file duplicates are still merged
            // correctly within this single pass, but no cross-reload
            // accumulation can occur.
            this._definitions = new Map();
            this._populateDefinitions(dict);
            this._isLoaded = true;

            // Persist to IndexedDB asynchronously (non-blocking)
            this._idbPut(STORE_NAME, KEY_WORDS, wordList).catch(console.warn);
            this._idbPut(STORE_NAME, KEY_DEFS,  this._serializeDefs()).catch(console.warn);
          }
        }
      } catch (fetchErr) {
        console.warn('Dictionary fetch failed — using cache or fallback:', fetchErr);
      }

      // 3. Emergency fallback
      if (!this._isLoaded || this._words.size === 0) {
        this._populate(['ada', 'baca', 'tulis', 'kerja', 'kucing', 'tidak', 'sudah', 'bisa', 'saya', 'kamu']);
        this._isLoaded = true;
      }
    } catch (err) {
      console.error('Dictionary.load() fatal:', err);
      this._populate(['ada', 'baca', 'tulis', 'kerja', 'tidak', 'sudah', 'bisa', 'saya', 'kamu']);
      this._isLoaded = true;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  isLoaded()        { return this._isLoaded; }
  getSize()         { return this._words.size; }
  getAllWords()      { return this._words; }
  getAllDefinitions(){ return this._definitions; }

  /** O(1) exact lookup */
  has(word) {
    return this._words.has((word ?? '').toLowerCase().trim());
  }

  /** Get definition object for a word */
  getDefinition(word) {
    return this._definitions.get((word ?? '').toLowerCase().trim()) || null;
  }

  /**
   * Autocomplete — returns up to `limit` words starting with `prefix`.
   * Uses Trie DFS for O(prefix + k) traversal.
   * @param {string} prefix
   * @param {number} limit
   * @returns {string[]}
   */
  suggest(prefix, limit = 8) {
    prefix = (prefix ?? '').toLowerCase().trim();
    if (!prefix) return [];

    let node = this._trie;
    for (const ch of prefix) {
      node = node.c[ch];
      if (!node) return [];
    }

    const results = [];
    this._dfs(node, results, AUTOCOMPLETE_SCAN_LIMIT);

    return results
      .sort((a, b) => this._rankAutocomplete(prefix, a, b))
      .slice(0, limit);
  }

  /**
   * SymSpell fuzzy candidates — does NOT scan the full dictionary.
   * Returns words within `maxDistance` edits via the pre-built delete index.
   * @param {string} word
   * @param {number} maxDistance
   * @param {number} limit
   * @returns {string[]}
   */
  fuzzyCandidates(word, maxDistance = SYMSPELL_MAX_DISTANCE, limit = 100) {
    const norm = (word ?? '').toLowerCase().trim();
    if (!norm) return [];

    const candidates = new Set();
    if (this._words.has(norm)) candidates.add(norm);

    const queryDeletes = _generateDeletes(norm, maxDistance, SYMSPELL_PREFIX_LEN);
    // Also add the raw prefix itself as a lookup key
    queryDeletes.add(norm.slice(0, SYMSPELL_PREFIX_LEN));

    for (const key of queryDeletes) {
      const bucket = this._deleteIdx.get(key);
      if (!bucket) continue;

      for (const cand of bucket) {
        // Quick length guard before paying edit-distance cost in caller
        if (Math.abs(cand.length - norm.length) <= maxDistance + 1) {
          candidates.add(cand);
          if (candidates.size >= limit) return Array.from(candidates);
        }
      }
    }

    return Array.from(candidates);
  }

  // ── Internal Builders ─────────────────────────────────────────────────────

  _populate(wordList) {
    const normalized = wordList
      .map(w => (w ?? '').toLowerCase().trim())
      .filter(Boolean);

    this._words      = new Set(normalized);
    this._wordsArray = Array.from(this._words).sort();

    this._buildTrie(this._wordsArray);
    this._buildDeleteIndex(this._wordsArray);
  }

  _buildTrie(words) {
    this._trie = _trieNode();
    for (const word of words) {
      let node = this._trie;
      for (const ch of word) {
        if (!node.c[ch]) node.c[ch] = _trieNode();
        node = node.c[ch];
      }
      node.w = word;
    }
  }

  /** DFS over Trie to collect words */
  _dfs(startNode, results, limit) {
    const stack = [startNode];
    while (stack.length && results.length < limit) {
      const node = stack.pop();
      if (node.w) results.push(node.w);
      // Push children in reverse-alphabetical order so stack pops alphabetically
      const keys = Object.keys(node.c).sort().reverse();
      for (const k of keys) stack.push(node.c[k]);
    }
  }

  _rankAutocomplete(prefix, a, b) {
    const pa = AUTOCOMPLETE_PRIORITY[a] || 0;
    const pb = AUTOCOMPLETE_PRIORITY[b] || 0;
    if (pa !== pb) return pb - pa;

    // Exact prefix match first
    const aP = a.startsWith(prefix) ? 1 : 0;
    const bP = b.startsWith(prefix) ? 1 : 0;
    if (aP !== bP) return bP - aP;

    // Shorter words first (more likely to be base words)
    if (a.length !== b.length) return a.length - b.length;

    return a.localeCompare(b, 'id');
  }

  _buildDeleteIndex(words) {
    this._deleteIdx = new Map();

    for (const word of words) {
      if (word.length < 3) continue; // very short words don't need fuzzy

      const deletes = _generateDeletes(word, SYMSPELL_MAX_DISTANCE, SYMSPELL_PREFIX_LEN);
      for (const key of deletes) {
        let bucket = this._deleteIdx.get(key);
        if (!bucket) {
          bucket = [];
          this._deleteIdx.set(key, bucket);
        }
        bucket.push(word);
      }
    }
  }

  _populateDefinitions(dictArray) {
    for (const entry of dictArray) {
      const word = (entry?.word ?? '').toLowerCase().trim();
      if (!word) continue;

      let arti        = entry.arti || null;
      let isIncomplete = false;

      if (arti) {
        const v   = kbbiValidator.validate(arti);
        isIncomplete = v.isIncomplete;
        arti         = v.fixedText;
      }

      const existing = this._definitions.get(word);
      if (!existing) {
        this._definitions.set(word, { arti, type: entry.type || null, isIncomplete });
      } else {
        this._definitions.set(word, {
          arti       : existing.arti ? `${existing.arti}\n\n${arti}` : arti,
          type       : existing.type || entry.type || null,
          isIncomplete: existing.isIncomplete || isIncomplete,
        });
      }
    }
  }

  // ── Definition Cache Helpers ──────────────────────────────────────────────

  _serializeDefs() {
    const obj = Object.create(null);
    for (const [k, v] of this._definitions) obj[k] = v;
    return obj;
  }

  _loadCachedDefs(obj) {
    for (const [k, v] of Object.entries(obj)) {
      this._definitions.set(k, v);
    }
  }

  // ── IndexedDB Helpers ─────────────────────────────────────────────────────

  async _idbGet(store, key) {
    try {
      const db = await _getDB();
      return new Promise((resolve) => {
        const tx  = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror   = () => resolve(null);
      });
    } catch { return null; }
  }

  async _idbPut(store, key, value) {
    try {
      const db = await _getDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IDB write error:', err);
    }
  }
}
