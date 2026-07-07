/**
 * autocorrect.js — Candidate generation + scoring for typo correction.
 *
 * Architecture:
 * 1. Priority maps (exact O(1) lookup): typoMap → tidakBakuMap
 * 2. SymSpell-style delete index (O(k) candidate lookup, pre-built in Dictionary)
 * 3. Phonetic variants (deterministic rules per-query)
 * 4. Trie prefix traversal (only for very short inputs)
 * 5. Bounded Damerau-Levenshtein scoring on candidate set only
 *    (NEVER full dictionary scan)
 *
 * Complexity: O(k) candidates × O(n·m) scoring where k ≪ |dictionary|
 */

import { boundedDamerauLevenshteinDistance } from './edit-distance.js';
import { generatePhoneticVariants, getCommonTypoMap } from './typo-patterns.js';

// ---------------------------------------------------------------------------
// Word frequency table — higher scores bubble up in ranked suggestions.
// Covers top ~200 most commonly used Indonesian words.
// ---------------------------------------------------------------------------
const WORD_FREQUENCY = Object.freeze(Object.assign(Object.create(null), {
  // Function words (very high frequency)
  'yang'    : 200, 'di'     : 195, 'ini'    : 190, 'itu'    : 190,
  'dan'     : 185, 'dari'   : 180, 'ke'     : 175, 'dengan' : 170,
  'untuk'   : 165, 'tidak'  : 160, 'adalah' : 155, 'dalam'  : 150,
  'pada'    : 145, 'oleh'   : 140, 'akan'   : 135, 'juga'   : 130,
  'karena'  : 125, 'bisa'   : 120, 'dapat'  : 115, 'atau'   : 110,
  'ada'     : 105, 'lebih'  : 100, 'sudah'  : 95,  'saya'   : 90,
  'belum'   : 85,  'masih'  : 80,  'bila'   : 75,  'agar'   : 70,
  'sehingga': 65,  'namun'  : 60,  'tetapi' : 55,  'bahwa'  : 50,
  'antara'  : 45,  'para'   : 40,  'telah'  : 35,  'harus'  : 30,
  'sangat'  : 25,  'lain'   : 20,  'sama'   : 18,  'pun'    : 15,
  'kalau'   : 15,  'apabila': 14,  'ketika' : 13,  'setelah': 12,
  'sebelum' : 11,  'kemudian': 10,

  // Content words (medium frequency)
  'kerja'   : 35, 'belajar' : 30, 'makan'  : 28, 'minum'  : 25,
  'bicara'  : 22, 'jalan'   : 20, 'lihat'  : 18, 'tulis'  : 16,
  'baca'    : 15, 'pikir'   : 14, 'cari'   : 13, 'beli'   : 12,
  'jual'    : 11, 'buat'    : 10, 'kirim'  : 9,  'ambil'  : 8,

  // Technology words
  'aplikasi': 40, 'sistem'  : 38, 'data'   : 36, 'program': 34,
  'komputer': 32, 'internet': 30, 'teknologi': 28, 'digital': 26,

  // Common targets for autocorrect
  'risiko'  : 25, 'analisis': 24, 'aktif'  : 23, 'paham'  : 22,
  'praktik' : 21, 'izin'    : 20, 'zaman'  : 19, 'salat'  : 18,
}));

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * Sørensen–Dice bigram coefficient — fast character overlap metric.
 * Returns 0..1 (1 = identical).
 */
function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.charCodeAt(i) * 65536 + a.charCodeAt(i + 1);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.charCodeAt(i) * 65536 + b.charCodeAt(i + 1);
    const cnt = bigramsA.get(bg) || 0;
    if (cnt > 0) {
      overlap++;
      bigramsA.set(bg, cnt - 1);
    }
  }

  return (2 * overlap) / (a.length + b.length - 2);
}

// ---------------------------------------------------------------------------
// Source priority for ranking (lower = higher priority)
// ---------------------------------------------------------------------------
const SOURCE_RANK = Object.freeze({
  typo_map       : 0,
  common_typo_map: 1,
  tidak_baku_map : 2,
  phonetic       : 3,
  symspell       : 4,
  prefix         : 5,
});

// ---------------------------------------------------------------------------
// Autocorrect Class
// ---------------------------------------------------------------------------
export class Autocorrect {
  /**
   * @param {object} deps
   * @param {import('./dictionary.js').Dictionary} deps.dictionary
   * @param {Record<string,string>} deps.tidakBakuMap
   * @param {Record<string,string>} deps.typoMap
   */
  constructor({ dictionary, tidakBakuMap = {}, typoMap = {} }) {
    this.dictionary   = dictionary;
    this.tidakBakuMap = tidakBakuMap;
    this.typoMap      = typoMap;
    this._commonTypoMap = getCommonTypoMap();
  }

  /** Get frequency score (higher = more common) */
  _freq(word) {
    return WORD_FREQUENCY[word] || 0;
  }

  /**
   * Generate ranked correction suggestions for a misspelled word.
   *
   * @param {string} input - The misspelled word
   * @param {object} [opts]
   * @param {number} [opts.maxEditDistance=2]
   * @param {number} [opts.limit=5]
   * @returns {Array<{word:string, dist:number, source:string}>}
   */
  suggest(input, opts = {}) {
    const w = (input ?? '').trim().toLowerCase();
    if (!w || w.length < 2) return [];

    const maxDist = opts.maxEditDistance ?? 2;
    const limit   = opts.limit ?? 5;

    const seen       = new Set();
    const candidates = [];

    const push = (word, source) => {
      const cw = (word ?? '').trim().toLowerCase();
      if (!cw || seen.has(cw)) return;
      seen.add(cw);
      candidates.push({ word: cw, source, dist: Infinity, prefix: 0, similarity: 0, lengthDelta: 0 });
    };

    // 1. Priority maps — exact O(1) lookup
    const typoHit  = this.typoMap[w];
    const tbHit    = this.tidakBakuMap[w];
    const commonHit = this._commonTypoMap[w];

    if (typoHit)   push(typoHit,  'typo_map');
    if (tbHit)     push(tbHit,    'tidak_baku_map');
    if (commonHit && commonHit !== typoHit && commonHit !== tbHit) {
      push(commonHit, 'common_typo_map');
    }

    // 2. Phonetic variants (deterministic, cheap)
    const variants = generatePhoneticVariants(w);
    for (const v of variants) {
      if (this.dictionary && this.dictionary.has(v)) push(v, 'phonetic');
    }

    // 3. SymSpell-style fuzzy candidates (O(deletes) lookup via pre-built index)
    if (this.dictionary && typeof this.dictionary.fuzzyCandidates === 'function') {
      const fuzzy = this.dictionary.fuzzyCandidates(w, maxDist, 100);
      for (const c of fuzzy) push(c, 'symspell');
    }

    // 4. Trie prefix candidates (only for short inputs, keeps count low)
    if (w.length <= 5 && this.dictionary && typeof this.dictionary.suggest === 'function') {
      const prefixResults = this.dictionary.suggest(w.slice(0, Math.min(3, w.length)), 20);
      for (const c of prefixResults) push(c, 'prefix');
    }

    // 5. Score all candidates — ONLY against the small candidate set
    for (const c of candidates) {
      const lenDiff = Math.abs(c.word.length - w.length);
      if (lenDiff > maxDist + 1) {
        c.dist = maxDist + 2;
        continue;
      }
      c.dist        = boundedDamerauLevenshteinDistance(w, c.word, maxDist + 1);
      c.prefix      = commonPrefixLength(w, c.word);
      c.similarity  = diceCoefficient(w, c.word);
      c.lengthDelta = lenDiff;
    }

    // 6. Rank and filter
    return candidates
      .filter(c => c.dist <= maxDist + 1)
      .sort((a, b) => {
        // a) Edit distance (lower is better)
        if (a.dist !== b.dist) return a.dist - b.dist;

        // b) Source priority
        const ra = SOURCE_RANK[a.source] ?? 9;
        const rb = SOURCE_RANK[b.source] ?? 9;
        if (ra !== rb) return ra - rb;

        // c) Common prefix length (longer prefix = better)
        if (a.prefix !== b.prefix) return b.prefix - a.prefix;

        // d) Bigram similarity (higher = better)
        if (Math.abs(a.similarity - b.similarity) > 0.01) return b.similarity - a.similarity;

        // e) Length delta (closer length = better)
        if (a.lengthDelta !== b.lengthDelta) return a.lengthDelta - b.lengthDelta;

        // f) Word frequency (more common = better)
        const fa = this._freq(a.word);
        const fb = this._freq(b.word);
        if (fa !== fb) return fb - fa;

        // g) Lexicographic tie-break
        return a.word.localeCompare(b.word);
      })
      .slice(0, limit);
  }
}
