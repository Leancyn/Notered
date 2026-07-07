/**
 * spellcheck.js — Spell Checker and Suggestion Engine
 *
 * Check pipeline (in order of cost — cheapest first):
 * 1. Ignore: empty, numeric, URL, single char                  O(1)
 * 2. Typo exact map                                            O(1)
 * 3. Tidak-baku exact map                                      O(1)
 * 4. Common typo patterns                                      O(1)
 * 5. Whitelist (abbreviations, domain tokens)                  O(1)
 * 6. Dictionary exact lookup                                   O(1)
 * 7. Reduplication detection                                   O(n)
 * 8. Morphological stemming + dictionary lookup                O(n)
 * 9. Suggestion generation (SymSpell + Trie + DL scoring)      O(k·n·m)
 *
 * Critical: steps 1–8 handle the vast majority of real text.
 * Step 9 (expensive) only runs for genuinely unknown words.
 */

import { stem } from './stemmer.js';
import { Autocorrect } from './autocorrect.js';
import { loadTypoMapUnified } from './typo-loader.js';
import { TIDAK_BAKU_MAP, TYPO_MAP, checkCommonTypos, getCommonTypoMap } from './typo-patterns.js';
import { levenshteinDistance, damerauLevenshteinDistance } from './edit-distance.js';

// ---------------------------------------------------------------------------
// Whitelist — tokens that are always correct (skip spell check entirely)
// ---------------------------------------------------------------------------
const WHITELIST = new Set([
  // Conjunctions & particles
  'dan', 'atau', 'tetapi', 'namun', 'melainkan', 'sedangkan', 'sementara',
  'maupun', 'pun', 'lah', 'kah', 'pun', 'lagi',

  // Pronouns
  'saya', 'aku', 'kamu', 'anda', 'dia', 'ia', 'beliau', 'mereka', 'kami',
  'kita', 'kalian',

  // Prepositions
  'di', 'ke', 'dari', 'pada', 'oleh', 'untuk', 'dengan', 'dalam',
  'atas', 'bawah', 'tentang', 'antara', 'menurut', 'berdasarkan',
  'melalui', 'terhadap', 'kepada', 'bagi',

  // Very common words
  'yang', 'adalah', 'itu', 'ini', 'ada', 'tidak', 'bukan', 'ya', 'sudah',
  'belum', 'akan', 'masih', 'harus', 'bisa', 'dapat', 'boleh', 'mau',

  // Units & currency
  'rp', 'idr', 'usd', 'eur', 'km', 'kg', 'cm', 'gr', 'mg', 'ml', 'ltr',
  'mb', 'gb', 'tb', 'hz', 'ghz', 'wh',

  // Abbreviations
  'dll', 'dsb', 'dst', 'dkk', 'tsb', 'yth', 'ttd', 'hlm', 'hal',

  // Web / tech tokens
  'id', 'co', 'org', 'net', 'com', 'www', 'http', 'https',

  // App-specific
  'notered', 'kbbi',
]);

// ---------------------------------------------------------------------------
// Regex patterns — compiled once at module load
// ---------------------------------------------------------------------------
const RE_NUMERIC         = /^[0-9][0-9.,/%]*$/;
const RE_PUNCTUATION_ONLY = /^[^\p{L}\p{N}]+$/u;
const RE_URL             = /^https?:\/\//;
const RE_HAS_DOT         = /\./;
const RE_REDUPLICATION   = /^([\p{L}\p{N}]+)-\1$/u;
// Roman numerals I–XIX
const RE_ROMAN           = /^(i{1,3}|iv|vi{0,3}|ix|xi{0,3}|xiv|xvi{0,3}|xix)$/i;

// ---------------------------------------------------------------------------
// SpellChecker
// ---------------------------------------------------------------------------
export class SpellChecker {
  /**
   * @param {import('./dictionary.js').Dictionary} dictionary
   * @param {Record<string,string>} [tidakBakuMap]  (kept for API compat, not used internally now)
   */
  constructor(dictionary, tidakBakuMap = {}) {
    this.dictionary     = dictionary;
    // Merge param map with built-in TIDAK_BAKU_MAP
    this.tidakBakuMap   = Object.assign(Object.create(null), TIDAK_BAKU_MAP, tidakBakuMap);
    this.typoMap        = Object.assign(Object.create(null), TYPO_MAP);
    this._commonTypoMap = getCommonTypoMap();

    this._autocorrect   = this._buildAutocorrect();

    // Cache: word → result (cleared when dictionary refreshes)
    this._cache = new Map();
  }

  async init() {
    // Load additional typo mappings extracted from the KBBI dataset
    const extracted = await loadTypoMapUnified({
      dictionaryUrl       : './data/dictionary__JSON.json',
      fallbackUrl         : './data/typo.json',
      extractionMaxEntries: 0,
    });

    if (extracted && Object.keys(extracted).length > 0) {
      // Merge — static maps have priority (they are manually curated)
      this.typoMap = Object.assign(Object.create(null), extracted, TYPO_MAP);
      this._autocorrect = this._buildAutocorrect();
    }

    // Clear check cache after maps are refreshed
    this._cache.clear();
  }

  _buildAutocorrect() {
    return new Autocorrect({
      dictionary  : this.dictionary,
      tidakBakuMap: this.tidakBakuMap,
      typoMap     : this.typoMap,
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Check a single word.
   * @param {string} word
   * @returns {{ valid: boolean, type: string, suggestions: string[], bakuForm: string|null }}
   */
  check(word) {
    const raw = (word ?? '').trim();
    if (!raw) return { valid: true, type: 'ignored', suggestions: [], bakuForm: null };

    const clean = raw.toLowerCase();

    // Check result cache first
    const cached = this._cache.get(clean);
    if (cached) return cached;

    const result = this._checkInternal(raw, clean);
    this._cache.set(clean, result);
    return result;
  }

  /** Invalidate the per-word cache (call after dictionary update) */
  clearCache() {
    this._cache.clear();
  }

  /** Generate up to `limit` suggestions for a misspelled word */
  findSuggestions(input, maxDistance = 2, limit = 5) {
    const ranked = this._autocorrect.suggest(input, { maxEditDistance: maxDistance, limit });
    return ranked.map(r => r.word);
  }

  /** Levenshtein wrapper (backward-compat) */
  levenshteinDistance(a, b) { return levenshteinDistance(a, b); }

  /** Damerau-Levenshtein wrapper (backward-compat) */
  damerauDistance(a, b) { return damerauLevenshteinDistance(a, b); }

  // -------------------------------------------------------------------------
  // Internal check pipeline
  // -------------------------------------------------------------------------

  _checkInternal(raw, clean) {
    const OK    = (type) => ({ valid: true,  type, suggestions: [], bakuForm: null });
    const WARN  = (form, sug) => ({ valid: false, type: 'tidak_baku', suggestions: sug, bakuForm: form });
    const ERR   = (sug) => ({ valid: false, type: 'error',      suggestions: sug, bakuForm: null });

    // --- Step 1: Ignore categories ---
    if (clean.length <= 1)                    return OK('ignored');
    if (RE_NUMERIC.test(clean))               return OK('ignored');
    if (RE_PUNCTUATION_ONLY.test(clean))      return OK('ignored');
    if (RE_URL.test(clean))                   return OK('ignored');
    if (RE_HAS_DOT.test(clean))               return OK('ignored');  // URLs, file extensions
    if (RE_ROMAN.test(clean))                 return OK('ignored');

    // --- Step 2: Exact typo map (highest-priority correction) ---
    const typoMatch = this.typoMap[clean];
    if (typoMatch) {
      return { valid: false, type: 'error', suggestions: [typoMatch], bakuForm: null };
    }

    // --- Step 3: Tidak-baku exact map ---
    const tbMatch = this.tidakBakuMap[clean];
    if (tbMatch) return WARN(tbMatch, [tbMatch]);

    // --- Step 4: Common typo patterns (pattern lib) ---
    const patternMatch = checkCommonTypos(clean);
    if (patternMatch) {
      // Decide if it's a style issue (tidak baku) or a typo
      if (TIDAK_BAKU_MAP[clean]) return WARN(patternMatch, [patternMatch]);
      return ERR([patternMatch]);
    }

    // --- Step 5: Whitelist ---
    if (WHITELIST.has(clean)) return OK('whitelisted');

    // --- Step 6: Exact dictionary lookup ---
    if (this.dictionary && this.dictionary.has(clean)) return OK('correct');

    // --- Step 7: Case-insensitive capital check (e.g. "Jakarta" → correct) ---
    // We already lowercased to `clean`, but some words are only stored lowercase.
    // If the original was ALL-CAPS short token, treat as abbreviation / proper noun.
    if (raw.length <= 4 && raw === raw.toUpperCase()) return OK('ignored');

    // --- Step 8: Reduplication (buku-buku, berlari-lari) ---
    const redup = clean.match(RE_REDUPLICATION);
    if (redup && this.dictionary && this.dictionary.has(redup[1])) return OK('correct');

    // --- Step 9: Morphological stemming ---
    if (this.dictionary) {
      const base = stem(clean, this.dictionary.getAllWords());
      if (base && base !== clean && this.dictionary.has(base)) return OK('correct');
    }

    // --- Step 10: Suggestion generation ---
    const suggestions = this.findSuggestions(clean, 2, 5);
    return ERR(suggestions);
  }
}
