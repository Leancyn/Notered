/**
 * dictionary.js - Notered Dictionary Loader and Cacher
 * 
 * Fetches and parses the kbbi-words database. Implements
 * IndexedDB storage to speed up consecutive app loads.
 */

const DB_NAME = 'NoteredDB';
const DB_VERSION = 1;
const STORE_NAME = 'dictionary';
const KEY_NAME = 'kbbi_words';

export class Dictionary {
  constructor() {
    this._words = new Set();
    this._wordsArray = []; // Sorted array for binary searches & autocomplete
    this._isLoaded = false;
  }

  /**
   * Initialize and load dictionary from cache or server
   * @returns {Promise<void>}
   */
  async load() {
    try {
      // 1. Try loading from IndexedDB cache
      const cached = await this._getFromCache();
      if (cached && cached.length > 0) {
        this._populate(cached);
        this._isLoaded = true;
        return;
      }

      // 2. Fetch from static JSON file
      const res = await fetch('./data/kbbi-words.json');
      if (!res.ok) {
        throw new Error('Gagal mengambil database KBBI');
      }

      const words = await res.json();
      
      // 3. Populate internal structures
      this._populate(words);
      this._isLoaded = true;

      // 4. Save to cache asynchronously
      this._saveToCache(words).catch(err => {
        console.warn('IndexedDB write warning:', err);
      });

    } catch (err) {
      console.error('Dictionary load failure:', err);
      // Fail-safe: try to load an emergency basic set in case everything failed
      this._populate(['ada', 'baca', 'tulis', 'kerja', 'kucing', 'tidak', 'sudah', 'bisa', 'saya', 'kamu']);
      this._isLoaded = true;
    }
  }

  /** Check if dictionary load has completed */
  isLoaded() {
    return this._isLoaded;
  }

  /**
   * Check if a word exists in the dictionary
   * @param {string} word - Lowercase word
   * @returns {boolean}
   */
  has(word) {
    return this._words.has(word.toLowerCase());
  }

  /** Get number of words loaded */
  getSize() {
    return this._words.size;
  }

  /** Get the raw Set object */
  getAllWords() {
    return this._words;
  }

  /**
   * Auto-complete suggestions matching a prefix
   * @param {string} prefix - Starting letters
   * @param {number} limit - Max suggestions to return
   * @returns {string[]} Matching words list
   */
  suggest(prefix, limit = 5) {
    prefix = prefix.toLowerCase();
    if (!prefix) return [];

    const results = [];
    // Binary search to find start index of matches
    let low = 0;
    let high = this._wordsArray.length - 1;
    let startIdx = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const val = this._wordsArray[mid];

      if (val.startsWith(prefix)) {
        startIdx = mid;
        // Keep looking left for the earliest match
        high = mid - 1;
      } else if (val < prefix) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (startIdx !== -1) {
      // Gather all consecutive words starting with prefix
      for (let i = startIdx; i < this._wordsArray.length; i++) {
        const val = this._wordsArray[i];
        if (val.startsWith(prefix)) {
          results.push(val);
          if (results.length >= limit) break;
        } else {
          break; // Words no longer start with prefix
        }
      }
    }

    return results;
  }

  /** Populates Set and Array from flat list */
  _populate(wordList) {
    this._words = new Set(wordList);
    // Sort array just in case the JSON source wasn't perfectly sorted
    this._wordsArray = Array.from(this._words).sort();
  }

  /* --- IndexedDB Helpers --- */

  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async _getFromCache() {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(KEY_NAME);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return null;
    }
  }

  async _saveToCache(words) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(words, KEY_NAME);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to cache dictionary:', e);
    }
  }
}
