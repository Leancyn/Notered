/**
 * sketch.js - Sketch Reference Module for Notered
 *
 * Allows users to search for reference images and convert them
 * to pencil sketches using Canvas color-dodge blending technique.
 * Now uses Web Worker for off-main-thread processing.
 */

import { Storage } from "./storage.js";

export class SketchSearch {
  /** Default Unsplash API key (Client ID) — proyek pribadi */
  static DEFAULT_UNSPLASH_KEY = "aS5uJ3zTxy5gr5IcIlnaJ-zFUIdvcHirXc-jvlLApPM";

  /**
   * @param {object} options
   * @param {function} options.onResults - Called with search results array
   * @param {function} options.onLoading - Called with boolean loading state
   * @param {function} options.onError - Called with error message
   */
  constructor(options = {}) {
    this.onResults = options.onResults || (() => {});
    this.onLoading = options.onLoading || (() => {});
    this.onError = options.onError || (() => {});

    this._apiKey = SketchSearch.DEFAULT_UNSPLASH_KEY; // Default; bisa di-override dari settings
    this._worker = null;
    this._cache = new Map();
    this._sketchCache = new Map(); // Cache for sketch results: key = "url_blur_contrast"

    this._loadApiKey();
    this._loadSource();
    this._initWorker();
  }

  /** Load API key from storage (settings key menimpa default) */
  _loadApiKey() {
    const settings = Storage.loadSettings();
    this._apiKey = settings.apiKey || SketchSearch.DEFAULT_UNSPLASH_KEY;
  }

  /** Load preferred search source from storage ("unsplash" | "wikimedia" | "openverse") */
  _loadSource() {
    const settings = Storage.loadSettings();
    this._source = settings.searchSource || "unsplash";
  }

  /** Set the active search source */
  setSource(source) {
    this._source = source;
  }

  /** Initialize Web Worker for sketch processing */
  _initWorker() {
    try {
      this._worker = new Worker("js/sketch-worker.js");
      this._worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === "result") {
          this._resolveSketch(msg.imageData);
        } else if (msg.type === "progress") {
          if (this._onSketchProgress) {
            this._onSketchProgress(msg.percent);
          }
        } else if (msg.type === "error") {
          if (this._rejectSketch) {
            this._rejectSketch(new Error(msg.message));
          }
        }
      };
      this._worker.onerror = (err) => {
        console.error("Sketch worker error:", err);
        if (this._rejectSketch) {
          this._rejectSketch(new Error("Worker error"));
        }
      };
    } catch (err) {
      console.warn("Web Worker not available, falling back to main thread:", err);
      this._worker = null;
    }
  }

  /** Update API key */
  setApiKey(key) {
    this._apiKey = key;
  }

  /**
   * Search for images by keyword
   * @param {string} query - Search keyword
   * @param {number} page - Page number (1-based)
   * @param {number} perPage - Results per page
   * @returns {Promise<Array>} Array of image objects
   */
  async search(query, page = 1, perPage = 12) {
    if (!query.trim()) {
      this.onResults([]);
      return [];
    }

    // Check cache
    const cacheKey = `${query}_${page}`;
    if (this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      this.onResults(cached);
      return cached;
    }

    this.onLoading(true);

    try {
      let results;

      switch (this._source) {
        case "wikimedia":
          results = await this._searchFallback(query, page, perPage);
          break;
        case "openverse":
          results = await this._searchOpenverse(query, page, perPage);
          break;
        case "unsplash":
        default:
          if (this._apiKey) {
            results = await this._searchUnsplash(query, page, perPage);
          } else {
            // Unsplash membutuhkan API key milik pengguna sendiri.
            // Tanpa key, beri tahu pengguna alih-alih pencarian kosong.
            throw new Error("Masukkan API Key Unsplash kamu di Pengaturan untuk menggunakan sumber ini.");
          }
          break;
      }

      this._cache.set(cacheKey, results);
      this.onResults(results);
      return results;
    } catch (err) {
      console.error("Sketch search error:", err);
      this.onError(err && err.message ? err.message : "Miau! Gagal mencari gambar. Periksa koneksi internet ya.");
      return [];
    } finally {
      this.onLoading(false);
    }
  }

  /** Search via Unsplash API */
  async _searchUnsplash(query, page, perPage) {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("page", page);
    url.searchParams.set("per_page", perPage);
    url.searchParams.set("orientation", "squarish");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${this._apiKey}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("API key tidak valid");
      }
      throw new Error(`Unsplash API error: ${res.status}`);
    }

    const data = await res.json();

    return data.results.map((photo) => ({
      id: photo.id,
      thumb: photo.urls.small,
      regular: photo.urls.regular,
      full: photo.urls.full,
      alt: photo.alt_description || query,
      author: photo.user.name,
      authorUrl: photo.user.links.html,
      color: photo.color,
      width: photo.width,
      height: photo.height,
    }));
  }

  /**
   * Search via Openverse API (WordPress) — keyless, CORS-enabled.
   * Docs: https://api.openverse.org/v1/images/
   */
  async _searchOpenverse(query, page, perPage) {
    try {
      const url = new URL("https://api.openverse.org/v1/images/");
      url.searchParams.set("q", query);
      url.searchParams.set("page", page);
      url.searchParams.set("page_size", perPage);
      url.searchParams.set("mature", "false");
      url.searchParams.set("license_type", "all");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Openverse API error: ${res.status}`);

      const data = await res.json();
      const items = data.results || [];

      if (items.length === 0) {
        return this._getPlaceholderResults(query, page, perPage);
      }

      return items
        .filter((item) => item.url && item.thumbnail)
        .map((item) => ({
          id: `openverse-${item.id}`,
          thumb: item.thumbnail,
          regular: item.url,
          full: item.url,
          alt: item.title || query,
          author: item.creator || item.source || item.provider || "Openverse",
          authorUrl: item.foreign_landing_url || item.url,
          color: "#FFF8E7",
          width: item.width || 800,
          height: item.height || 800,
          source: "openverse",
        }));
    } catch (err) {
      console.warn("Openverse search failed, using placeholders:", err);
      return this._getPlaceholderResults(query, page, perPage);
    }
  }

  /**
   * Fallback search using Wikimedia Commons API (accurate, keyless, CORS-enabled)
   */
  async _searchFallback(query, page, perPage) {
    try {
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.searchParams.set("action", "query");
      url.searchParams.set("generator", "search");
      // Search for images with query word
      url.searchParams.set("gsrsearch", `filetype:bitmap ${query}`);
      url.searchParams.set("gsrlimit", perPage.toString());
      url.searchParams.set("prop", "imageinfo");
      url.searchParams.set("iiprop", "url");
      url.searchParams.set("format", "json");
      url.searchParams.set("origin", "*"); // Crucial for CORS

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Wikimedia fetch failed");

      const data = await res.json();

      if (!data.query || !data.query.pages) {
        // If no results, try fallback picsum
        return this._getPlaceholderResults(query, page, perPage);
      }

      const pages = Object.values(data.query.pages);
      return pages
        .filter((page) => page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url)
        .map((page) => {
          const imgUrl = page.imageinfo[0].url;
          // Clean title
          const title = page.title.replace("File:", "").replace(/\.[^/.]+$/, "");
          return {
            id: `wiki-${page.pageid}`,
            thumb: imgUrl,
            regular: imgUrl,
            full: imgUrl,
            alt: title || query,
            author: "Wikimedia Commons",
            authorUrl: "https://commons.wikimedia.org",
            color: "#FFF8E7",
            width: 600,
            height: 600,
          };
        });
    } catch (err) {
      console.warn("Wikimedia search failed, using placeholders:", err);
      return this._getPlaceholderResults(query, page, perPage);
    }
  }

  /** Emergency placeholder generator */
  _getPlaceholderResults(query, page, perPage) {
    const results = [];
    const startId = (page - 1) * perPage + 1;
    for (let i = 0; i < perPage; i++) {
      const seed = `${query}-${startId + i}`;
      const id = Math.abs(this._hashCode(seed)) % 1000;
      results.push({
        id: `picsum-${id}`,
        thumb: `https://picsum.photos/seed/${encodeURIComponent(seed)}/300/300`,
        regular: `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/800`,
        full: `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/1200`,
        alt: query,
        author: "Lorem Picsum (Mew)",
        authorUrl: "https://picsum.photos",
        color: "#FFFDF5",
        width: 800,
        height: 800,
      });
    }
    return results;
  }

  /** Simple string hash */
  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }

  /**
   * Convert an image URL to pencil sketch
   * Uses Web Worker when available, falls back to main thread.
   *
   * @param {string} imageUrl - URL of the image
   * @param {number} blurAmount - Blur intensity (1-30, default 10)
   * @param {number} contrastAmount - Contrast boost (0-100, default 0)
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<HTMLCanvasElement>} Canvas with sketch result
   */
  async convertToSketch(imageUrl, blurAmount = 10, contrastAmount = 0, onProgress = () => {}) {
    // Check sketch cache
    const cacheKey = `${imageUrl}_${blurAmount}_${contrastAmount}`;
    if (this._sketchCache.has(cacheKey)) {
      const cached = this._sketchCache.get(cacheKey);
      onProgress(100);
      return cached;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          onProgress(10);

          // Create canvas at reasonable size for performance
          const maxSize = 1200;
          let w = img.naturalWidth;
          let h = img.naturalHeight;

          if (w > maxSize || h > maxSize) {
            const ratio = Math.min(maxSize / w, maxSize / h);
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });

          // Draw original
          ctx.drawImage(img, 0, 0, w, h);
          onProgress(20);

          // Get image data
          const imageData = ctx.getImageData(0, 0, w, h);

          if (this._worker) {
            // Use Web Worker
            this._onSketchProgress = onProgress;
            this._resolveSketch = (resultImageData) => {
              ctx.putImageData(resultImageData, 0, 0);

              // Apply contrast boost if needed
              if (contrastAmount > 0) {
                this._applyContrast(canvas, contrastAmount);
              }

              onProgress(100);
              this._sketchCache.set(cacheKey, canvas);
              resolve(canvas);
            };
            this._rejectSketch = reject;

            this._worker.postMessage({
              type: "convert",
              imageData: imageData,
              blurAmount: blurAmount,
            });
          } else {
            // Fallback: process on main thread
            const result = this._processOnMainThread(imageData, blurAmount, contrastAmount, onProgress);
            ctx.putImageData(result, 0, 0);
            onProgress(100);
            this._sketchCache.set(cacheKey, canvas);
            resolve(canvas);
          }
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        reject(new Error("Gagal memuat gambar"));
      };

      img.src = imageUrl;
    });
  }

  /**
   * Fallback processing on main thread when Worker is unavailable
   */
  _processOnMainThread(imageData, blurAmount, contrastAmount, onProgress) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const totalPixels = w * h;

    // Step 1: Grayscale
    const gray = new Uint8Array(totalPixels);
    for (let i = 0; i < data.length; i += 4) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[i / 4] = g;
    }
    onProgress(35);

    // Step 2: Invert
    const inverted = new Uint8Array(totalPixels);
    for (let i = 0; i < gray.length; i++) {
      inverted[i] = 255 - gray[i];
    }
    onProgress(45);

    // Step 3: Box blur (2 passes)
    const blurred = this._boxBlur(inverted, w, h, blurAmount);
    const blurred2 = this._boxBlur(blurred, w, h, blurAmount);
    onProgress(70);

    // Step 4: Color Dodge blend
    for (let i = 0; i < gray.length; i++) {
      const base = gray[i];
      const blend = blurred2[i];

      let result;
      if (blend === 255) {
        result = 255;
      } else {
        result = Math.min(255, Math.floor((base * 256) / (256 - blend)));
      }

      const pi = i * 4;
      data[pi] = result;
      data[pi + 1] = result;
      data[pi + 2] = result;
      data[pi + 3] = 255;
    }
    onProgress(90);

    // Apply contrast boost
    if (contrastAmount > 0) {
      const factor = (259 * (contrastAmount + 255)) / (255 * (259 - contrastAmount));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, Math.round(factor * (data[i] - 128) + 128)));
        data[i + 1] = Math.min(255, Math.max(0, Math.round(factor * (data[i + 1] - 128) + 128)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(factor * (data[i + 2] - 128) + 128)));
      }
    }

    return imageData;
  }

  /**
   * Apply contrast boost to a canvas
   */
  _applyContrast(canvas, contrastAmount) {
    if (contrastAmount <= 0) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const factor = (259 * (contrastAmount + 255)) / (255 * (259 - contrastAmount));

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, Math.round(factor * (data[i] - 128) + 128)));
      data[i + 1] = Math.min(255, Math.max(0, Math.round(factor * (data[i + 1] - 128) + 128)));
      data[i + 2] = Math.min(255, Math.max(0, Math.round(factor * (data[i + 2] - 128) + 128)));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Box blur implementation (horizontal + vertical pass)
   * @param {Uint8Array} src - Source pixel data (single channel)
   * @param {number} w - Width
   * @param {number} h - Height
   * @param {number} radius - Blur radius
   * @returns {Uint8Array} Blurred data
   */
  _boxBlur(src, w, h, radius) {
    const dst = new Uint8Array(w * h);
    const temp = new Uint8Array(w * h);

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const rowOffset = y * w;

      // Initialize window
      for (let x = -radius; x <= radius; x++) {
        const xi = Math.min(Math.max(x, 0), w - 1);
        sum += src[rowOffset + xi];
      }
      temp[rowOffset] = Math.round(sum / (2 * radius + 1));

      for (let x = 1; x < w; x++) {
        const addIdx = Math.min(x + radius, w - 1);
        const removeIdx = Math.max(x - radius - 1, 0);
        sum += src[rowOffset + addIdx] - src[rowOffset + removeIdx];
        temp[rowOffset + x] = Math.round(sum / (2 * radius + 1));
      }
    }

    // Vertical pass
    for (let x = 0; x < w; x++) {
      let sum = 0;

      // Initialize window
      for (let y = -radius; y <= radius; y++) {
        const yi = Math.min(Math.max(y, 0), h - 1);
        sum += temp[yi * w + x];
      }
      dst[x] = Math.round(sum / (2 * radius + 1));

      for (let y = 1; y < h; y++) {
        const addIdx = Math.min(y + radius, h - 1);
        const removeIdx = Math.max(y - radius - 1, 0);
        sum += temp[addIdx * w + x] - temp[removeIdx * w + x];
        dst[y * w + x] = Math.round(sum / (2 * radius + 1));
      }
    }

    return dst;
  }

  /**
   * Download sketch canvas as PNG
   * @param {HTMLCanvasElement} canvas - The sketch canvas
   * @param {string} filename - Download filename
   */
  downloadSketch(canvas, filename = "sketsa-notered.png") {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /** Clear all caches */
  clearCache() {
    this._cache.clear();
    this._sketchCache.clear();
  }

  /** Terminate the Web Worker */
  destroy() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._cache.clear();
    this._sketchCache.clear();
  }
}
