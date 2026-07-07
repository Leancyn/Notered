/**
 * autocorrect.js - Candidate generation + scoring for typo correction
 */

import { damerauLevenshteinDistance } from "./edit-distance.js";
import { checkCommonTypos, generatePhoneticVariants, getCommonTypoMap } from "./typo-patterns.js";

/**
 * @typedef {object} AutocorrectOptions
 * @property {number} [maxEditDistance] - maximum edit distance to accept
 * @property {number} [limit] - max suggestions
 * @property {number} [prefixMinLen] - min prefix length to generate candidates
 * @property {number} [prefixMaxLen] - max prefix length to generate candidates
 */

// Common Indonesian word frequency for better ranking (higher = more common)
const WORD_FREQUENCY = {
  'tidak': 100,
  'yang': 95,
  'dan': 90,
  'dengan': 85,
  'untuk': 80,
  'dalam': 75,
  'adalah': 70,
  'ini': 65,
  'itu': 65,
  'saya': 60,
  'kamu': 55,
  'dia': 50,
  'mereka': 45,
  'kita': 45,
  'bisa': 40,
  'dapat': 40,
  'akan': 35,
  'dari': 35,
  'ke': 30,
  'di': 30,
  'pada': 25,
  'oleh': 25,
  'para': 20,
  'telah': 20,
  'belum': 15,
  'sudah': 15,
  'masih': 15,
  'lagi': 15,
  'akan': 15,
  'harus': 10,
  'wajib': 10,
  'boleh': 10,
  'boleh': 10,
  'bisa': 10,
  'dapat': 10,
  'menulis': 20,
  'membaca': 20,
  'kerja': 15,
  'bekerja': 15,
  'makan': 20,
  'minum': 15,
};

export class Autocorrect {
  /**
   * @param {object} deps
   * @param {import('./dictionary.js').Dictionary} deps.dictionary
   * @param {Record<string,string>|object} deps.tidakBakuMap
   * @param {Record<string,string>|object} deps.typoMap
   */
  constructor({ dictionary, tidakBakuMap = {}, typoMap = {} }) {
    this.dictionary = dictionary;
    this.tidakBakuMap = tidakBakuMap;
    this.typoMap = typoMap;
    this.commonTypoMap = getCommonTypoMap();
  }

  /**
   * Get word frequency score (higher = more common)
   * @param {string} word - The word to check
   * @returns {number} - Frequency score
   */
  _getFrequencyScore(word) {
    return WORD_FREQUENCY[word] || 1;
  }

  /**
   * @param {string} input
   * @param {AutocorrectOptions} opts
   * @returns {Array<{word:string, dist:number, source:string}>}
   */
  suggest(input, opts = {}) {
    const w = (input ?? "").trim().toLowerCase();
    if (!w) return [];

    const maxEditDistance = opts.maxEditDistance ?? 2;
    const limit = opts.limit ?? 5;
    const prefixMinLen = opts.prefixMinLen ?? 1;
    const prefixMaxLen = opts.prefixMaxLen ?? Math.min(4, w.length);

    // 1) typo exact mapping has priority
    const mapped = this.typoMap && this.typoMap[w];
    const commonMapped = this.commonTypoMap && this.commonTypoMap[w];
    const candidates = [];
    const seen = new Set();

    const pushCandidate = (word, source) => {
      const cw = (word ?? "").trim().toLowerCase();
      if (!cw || seen.has(cw)) return;
      seen.add(cw);
      candidates.push({ word: cw, source, dist: Infinity });
    };

    if (mapped) {
      pushCandidate(mapped, "typo_map");
    }

    if (commonMapped) {
      pushCandidate(commonMapped, "common_typo_map");
    }

    // 2) tidak-baku mapping candidates
    if (this.tidakBakuMap && this.tidakBakuMap[w]) {
      pushCandidate(this.tidakBakuMap[w], "tidak_baku_map");
    }

    // 3) Generate phonetic variants for additional candidates
    const phoneticVariants = generatePhoneticVariants(w);
    for (const variant of phoneticVariants) {
      if (this.dictionary.has(variant)) {
        pushCandidate(variant, "phonetic");
      }
    }

    // 4) prefix candidates via existing binary-search dictionary.suggest
    // Use incremental prefixes; this is fast and avoids brute-force.
    const prefixCandidates = new Set();
    for (let k = prefixMinLen; k <= prefixMaxLen; k++) {
      const prefix = w.slice(0, k);
      if (!prefix) continue;
      const list = this.dictionary.suggest(prefix, 10);
      for (const cand of list) prefixCandidates.add(cand);
      if (prefixCandidates.size >= 80) break;
    }
    for (const cand of prefixCandidates) pushCandidate(cand, "prefix");

    // 5) Score candidates using Damerau-Levenshtein
    for (const c of candidates) {
      // quick length filter
      if (Math.abs(c.word.length - w.length) > maxEditDistance + 1) {
        c.dist = maxEditDistance + 2;
        continue;
      }
      c.dist = damerauLevenshteinDistance(w, c.word);
    }

    // 6) Rank: prefer lower distance; then prefer typo/common sources; then frequency
    const sourceRank = {
      typo_map: 0,
      common_typo_map: 1,
      tidak_baku_map: 2,
      phonetic: 3,
      prefix: 4,
    };

    const ranked = candidates
      .filter((c) => c.dist <= maxEditDistance + 1)
      .sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist;
        const ra = sourceRank[a.source] ?? 9;
        const rb = sourceRank[b.source] ?? 9;
        if (ra !== rb) return ra - rb;
        // Prefer more common words
        const fa = this._getFrequencyScore(a.word);
        const fb = this._getFrequencyScore(b.word);
        if (fa !== fb) return fb - fa;
        return a.word.localeCompare(b.word);
      })
      .slice(0, limit);

    return ranked;
  }
}
