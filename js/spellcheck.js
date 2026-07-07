/**
 * spellcheck.js - Spell Checker and Suggestion Engine
 *
 * Verifies words against base KBBI dictionary, stemmed versions,
 * abbreviation whitelists, and generates corrections via Levenshtein.
 */

import { stem } from "./stemmer.js";

import { Autocorrect } from "./autocorrect.js";
import { loadTypoMapUnified } from "./typo-loader.js";
import { checkCommonTypos, getCommonTypoMap } from "./typo-patterns.js";
import { levenshteinDistance as sharedLevenshtein, damerauLevenshteinDistance } from "./edit-distance.js";

// Common abbreviations, URLs, and punctuation to skip or whitelist

const WHITELIST_WORDS = new Set([
  "dan",
  "atau",
  "tetapi",
  "namun",
  "melainkan",
  "sedangkan",
  "sementara",
  "yg",
  "dgn",
  "utk",
  "dlm",
  "ttg",
  "krn",
  "dll",
  "dsb",
  "dst",
  "dkk",
  "dst",
  "saya",
  "kamu",
  "dia",
  "mereka",
  "kami",
  "kita",
  "ia",
  "beliau",
  "anda",
  "rp",
  "idr",
  "usd",
  "km",
  "kg",
  "cm",
  "gr",
  "ml",
  "id",
  "co",
  "org",
  "net",
  "notered",
  "kbbi",
]);

export class SpellChecker {
  /**
   * @param {Dictionary} dictionary - Dictionary instance
   * @param {object} tidakBakuMap - Map of informal -> formal words
   */
  constructor(dictionary, tidakBakuMap = {}) {
    this.dictionary = dictionary;
    this.tidakBakuMap = tidakBakuMap;
    this.typoMap = {};
    this.commonTypoMap = getCommonTypoMap();

    this._autocorrect = new Autocorrect({
      dictionary: this.dictionary,
      tidakBakuMap: this.tidakBakuMap,
      typoMap: this.typoMap,
    });
  }

  /**
   * Initialize and load mapping files
   * @returns {Promise<void>}
   */
  async init() {
    // Only use dictionary_json dataset.
    // tidak-baku.json is intentionally disabled/removed per requirement.
    this.tidakBakuMap = this.tidakBakuMap || {};

    // Load typo map (typo -> correct)
    // Primary: extract from local dictionary__JSON.json (typo variants marked with "X ? Y").
    // Fallback: ./data/typo.json
    this.typoMap = await loadTypoMapUnified({
      dictionaryUrl: "./data/dictionary__JSON.json",
      fallbackUrl: "./data/typo.json",
      extractionMaxEntries: 0,
    });

    // keep autocorrect instance in sync
    this._autocorrect = new Autocorrect({
      dictionary: this.dictionary,
      tidakBakuMap: this.tidakBakuMap,
      typoMap: this.typoMap,
    });
  }

  /**
   * Perform comprehensive spelling check on a single word
   * @param {string} word - The tokenized word
   * @returns {object} Spelling status payload
   */
  check(word) {
    const cleanWord = word.trim().toLowerCase();

    // 1. Skip check if empty or too short
    if (!cleanWord) {
      return { valid: true, type: "ignored", suggestions: [], bakuForm: null };
    }

    // 2. Ignore pure numbers, punctuation, or URLs
    if (/^[0-9]+$/.test(cleanWord) || /^[^\p{L}\p{N}]+$/u.test(cleanWord) || cleanWord.startsWith("http") || cleanWord.includes(".")) {
      return { valid: true, type: "ignored", suggestions: [], bakuForm: null };
    }

    // 3. Check whitelist (abbreviations, pronouns)
    if (WHITELIST_WORDS.has(cleanWord)) {
      return { valid: true, type: "whitelisted", suggestions: [], bakuForm: null };
    }

    // 4. Check informal (tidak baku) mapping
    if (this.tidakBakuMap[cleanWord]) {
      const bakuForm = this.tidakBakuMap[cleanWord];
      return {
        valid: false,
        type: "tidak_baku",
        suggestions: [bakuForm],
        bakuForm: bakuForm,
      };
    }

    // 5. Check direct dictionary inclusion
    if (this.dictionary.has(cleanWord)) {
      return { valid: true, type: "correct", suggestions: [], bakuForm: null };
    }

    // 6. Stem the word and check dictionary inclusion
    const baseWord = stem(cleanWord);
    if (this.dictionary.has(baseWord)) {
      return { valid: true, type: "correct", suggestions: [], bakuForm: null };
    }

    // 7. Check common typo patterns (pattern-based corrections)
    const commonTypoCorrection = checkCommonTypos(cleanWord);
    if (commonTypoCorrection) {
      return {
        valid: false,
        type: "error",
        suggestions: [commonTypoCorrection],
        bakuForm: null,
      };
    }

    // 8. Check common typo map
    if (this.commonTypoMap[cleanWord]) {
      const correction = this.commonTypoMap[cleanWord];
      return {
        valid: false,
        type: "error",
        suggestions: [correction],
        bakuForm: null,
      };
    }

    // 9. Word is incorrect -> generate suggestions
    const suggestions = this.findSuggestions(cleanWord);

    return {
      valid: false,
      type: "error",
      suggestions: suggestions,
      bakuForm: null,
    };
  }

  /**
   * Find closest dictionary words using Levenshtein Distance
   * @param {string} input - Incorrect word
   * @param {number} maxDistance - Maximum edit operations allowed
   * @param {number} limit - Maximum suggestion list size
   * @returns {string[]} Suggestions list
   */
  findSuggestions(input, maxDistance = 2, limit = 5) {
    // Candidate generation + scoring (Damerau-Levenshtein) to avoid brute-force scan
    const ranked = this._autocorrect.suggest(input, {
      maxEditDistance: maxDistance,
      limit,
    });

    return ranked.map((r) => r.word);
  }

  /**
   * Levenshtein distance wrapper (delegates to shared implementation)
   * @param {string} a - String 1
   * @param {string} b - String 2
   * @returns {number} Edit distance
   */
  levenshteinDistance(a, b) {
    // Delegate to shared implementation in edit-distance.js
    return sharedLevenshtein(a, b);
  }

  /**
   * Damerau-Levenshtein distance wrapper (delegates to shared implementation)
   * Backward-compatible helper for Editor auto-correct.
   * @param {string} a - String 1
   * @param {string} b - String 2
   * @returns {number} Edit distance
   */
  damerauDistance(a, b) {
    // Delegate to shared implementation
    return damerauLevenshteinDistance(a, b);
  }
}
