/**
 * dictionary.js - Notered Dictionary Loader and Cacher
 *
 * Fetches and parses the kbbi-words database. Implements
 * IndexedDB storage to speed up consecutive app loads.
 */

// Shared IndexedDB connection pool
let _sharedDB = null;
let _dbPromise = null;

function _getDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open("NoteredDB", 3);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("dictionary")) {
            db.createObjectStore("dictionary");
          }
          if (!db.objectStoreNames.contains("kbbi_defs")) {
            db.createObjectStore("kbbi_defs");
          }
          if (!db.objectStoreNames.contains("typo")) {
            db.createObjectStore("typo");
          }
        };
        request.onsuccess = (e) => {
          _sharedDB = e.target.result;
          resolve(_sharedDB);
        };
        request.onerror = (e) => reject(e.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }
  return _dbPromise;
}

const DB_NAME = "NoteredDB";
const DB_VERSION = 3;
const STORE_NAME = "dictionary";
const KEY_NAME = "kbbi_words";

export class Dictionary {
  constructor() {
    this._words = new Set();
    this._wordsArray = []; // Sorted array for binary searches & autocomplete
    this._isLoaded = false;

    // Optional: GitHub-backed KBBI wordlist for better suggestion accuracy
    this._kbbiWordSources = [
      "https://raw.githubusercontent.com/dyazincahya/KBBI-SQL-database/main/dictionary__JSON.json",
    ];
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

      // 2. Fetch from GitHub dataset
      const githubWords = await this._fetchKbbiWordsFromGitHub();
      if (githubWords && githubWords.length) {
        this._populate(githubWords);
        this._isLoaded = true;
        this._saveToCache(githubWords).catch((err) => {
          console.warn("IndexedDB write warning:", err);
        });
        return;
      }

      // Fallback: local dictionary__JSON.json (safety net)
      const res = await fetch("./data/dictionary__JSON.json");
      if (!res.ok) {
        throw new Error("Gagal mengambil database KBBI");
      }
      const payload = await res.json();

      // dictionary__JSON.json format:
      // { dictionary: [ { _id, word, arti, type }, ... ] }
      // Convert to base word list for inclusion checks/autocomplete.
      const dict = Array.isArray(payload?.dictionary) ? payload.dictionary : Array.isArray(payload) ? payload : [];
      const words = dict.map((e) => e?.word ?? "").filter(Boolean);

      // 3. Populate internal structures
      this._populate(words);

      this._isLoaded = true;

      // 4. Save to cache asynchronously
      this._saveToCache(words).catch((err) => {
        console.warn("IndexedDB write warning:", err);
      });
    } catch (err) {
      console.error("Dictionary load failure:", err);
      // Fail-safe: try to load an emergency basic set in case everything failed
      this._populate(["ada", "baca", "tulis", "kerja", "kucing", "tidak", "sudah", "bisa", "saya", "kamu"]);
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

  /* --- IndexedDB Helpers (Shared Connection) --- */

  async _getFromCache() {
    try {
      const db = await _getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(KEY_NAME);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return null;
    }
  }

  async _fetchKbbiWordsFromGitHub() {
    // Returns array of base word strings from GitHub dataset.
    // If dataset is an object, we extract keys.
    // If dataset is an array, we use it directly.
    // This function also handles CORS by converting github.com blob URLs to raw.
    if (!this._kbbiWordSources || !this._kbbiWordSources.length) return null;

    const toRaw = (url) => {
      if (typeof url !== "string") return url;
      if (url.startsWith("https://raw.githubusercontent.com/")) return url;
      try {
        const u = new URL(url);
        const parts = u.pathname.split("/").filter(Boolean);
        const blobIdx = parts.indexOf("blob");
        if (blobIdx === -1) return url;
        const user = parts[0];
        const repo = parts[1];
        const branch = parts[blobIdx + 1];
        const rest = parts.slice(blobIdx + 2).join("/");
        if (!user || !repo || !branch || !rest) return url;
        return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${rest}`;
      } catch {
        return url;
      }
    };

    for (const src of this._kbbiWordSources) {
      const rawUrl = toRaw(src);
      try {
        const res = await fetch(rawUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (Array.isArray(data)) {
          return data;
        }

        // Some datasets are {"kata": {...}} (object), some are arrays of objects,
        // some are {"kata": "def"}. We extract keys + normalize to string list.
        if (data && typeof data === "object") {
          // 1) object map: {"kata": ...}
          if (!Array.isArray(Object.values(data)[0])) {
            return Object.keys(data);
          }
        }

        // If payload not recognized, skip.
        return null;
      } catch (e) {
        console.warn("Failed fetch kbbi wordlist from:", rawUrl, e);
      }
    }
    return null;
  }

  async _saveToCache(words) {
    try {
      const db = await _getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(words, KEY_NAME);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Failed to cache dictionary:", e);
    }
  }
}
