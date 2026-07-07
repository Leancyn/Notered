/**
 * spellcheck.js - Spell Checker and Suggestion Engine
 * 
 * Verifies words against base KBBI dictionary, stemmed versions,
 * abbreviation whitelists, and generates corrections via Levenshtein.
 */

import { stem } from './stemmer.js';

// Common abbreviations, URLs, and punctuation to skip or whitelist
const WHITELIST_WORDS = new Set([
  'dan', 'atau', 'tetapi', 'namun', 'melainkan', 'sedangkan', 'sementara',
  'yg', 'dgn', 'utk', 'dlm', 'ttg', 'krn', 'dll', 'dsb', 'dst', 'dkk', 'dst',
  'saya', 'kamu', 'dia', 'mereka', 'kami', 'kita', 'ia', 'beliau', 'anda',
  'rp', 'idr', 'usd', 'km', 'kg', 'cm', 'gr', 'ml', 'id', 'co', 'org', 'net',
  'notered', 'kbbi'
]);

export class SpellChecker {
  /**
   * @param {Dictionary} dictionary - Dictionary instance
   * @param {object} tidakBakuMap - Map of informal -> formal words
   */
  constructor(dictionary, tidakBakuMap = {}) {
    this.dictionary = dictionary;
    this.tidakBakuMap = tidakBakuMap;
  }

  /**
   * Initialize and load mapping files
   * @returns {Promise<void>}
   */
  async init() {
    // If map was not passed, load it
    if (Object.keys(this.tidakBakuMap).length === 0) {
      try {
        const res = await fetch('./data/tidak-baku.json');
        if (res.ok) {
          this.tidakBakuMap = await res.json();
        }
      } catch (err) {
        console.error('Failed to load tidak-baku mapping', err);
      }
    }
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
      return { valid: true, type: 'ignored', suggestions: [], bakuForm: null };
    }

    // 2. Ignore pure numbers, punctuation, or URLs
    if (/^[0-9]+$/.test(cleanWord) || /^[^\p{L}\p{N}]+$/u.test(cleanWord) || cleanWord.startsWith('http') || cleanWord.includes('.')) {
      return { valid: true, type: 'ignored', suggestions: [], bakuForm: null };
    }

    // 3. Check whitelist (abbreviations, pronouns)
    if (WHITELIST_WORDS.has(cleanWord)) {
      return { valid: true, type: 'whitelisted', suggestions: [], bakuForm: null };
    }

    // 4. Check informal (tidak baku) mapping
    if (this.tidakBakuMap[cleanWord]) {
      const bakuForm = this.tidakBakuMap[cleanWord];
      return {
        valid: false,
        type: 'tidak_baku',
        suggestions: [bakuForm],
        bakuForm: bakuForm
      };
    }

    // 5. Check direct dictionary inclusion
    if (this.dictionary.has(cleanWord)) {
      return { valid: true, type: 'correct', suggestions: [], bakuForm: null };
    }

    // 6. Stem the word and check dictionary inclusion
    const baseWord = stem(cleanWord);
    if (this.dictionary.has(baseWord)) {
      return { valid: true, type: 'correct', suggestions: [], bakuForm: null };
    }

    // 7. Word is incorrect -> generate suggestions
    const suggestions = this.findSuggestions(cleanWord);
    
    return {
      valid: false,
      type: 'error',
      suggestions: suggestions,
      bakuForm: null
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
    const candidates = [];
    const dictionaryWords = this.dictionary.getAllWords();

    for (const dictWord of dictionaryWords) {
      // Length optimization: skip candidates with massive length difference
      if (Math.abs(dictWord.length - input.length) > maxDistance) {
        continue;
      }

      const distance = this.levenshteinDistance(input, dictWord);
      
      if (distance <= maxDistance) {
        candidates.push({ word: dictWord, dist: distance });
      }
    }

    // Sort by distance (lower first), then alphabetically
    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.word.localeCompare(b.word);
    });

    return candidates.slice(0, limit).map(c => c.word);
  }

  /**
   * Levenshtein distance dynamic programming matrix implementation
   * @param {string} a - String 1
   * @param {string} b - String 2
   * @returns {number} Edit distance
   */
  levenshteinDistance(a, b) {
    const dp = [];
    
    for (let i = 0; i <= a.length; i++) {
      dp[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // Deletion
          dp[i][j - 1] + 1,      // Insertion
          dp[i - 1][j - 1] + cost // Substitution
        );
      }
    }

    return dp[a.length][b.length];
  }
}
