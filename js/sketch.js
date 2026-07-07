/**
 * sketch.js - Sketch Reference Module for Notered
 * 
 * Allows users to search for reference images and convert them
 * to pencil sketches using Canvas color-dodge blending technique.
 */

import { Storage } from './storage.js';

export class SketchSearch {
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
    
    this._apiKey = '';
    this._worker = null;
    this._cache = new Map();
    
    this._loadApiKey();
  }

  /** Load API key from storage */
  _loadApiKey() {
    const settings = Storage.loadSettings();
    this._apiKey = settings.apiKey || '';
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

      if (this._apiKey) {
        results = await this._searchUnsplash(query, page, perPage);
      } else {
        results = await this._searchFallback(query, page, perPage);
      }

      this._cache.set(cacheKey, results);
      this.onResults(results);
      return results;

    } catch (err) {
      console.error('Sketch search error:', err);
      this.onError('Gagal mencari gambar. Periksa koneksi internet.');
      return [];
    } finally {
      this.onLoading(false);
    }
  }

  /** Search via Unsplash API */
  async _searchUnsplash(query, page, perPage) {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('orientation', 'squarish');

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Client-ID ${this._apiKey}`
      }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('API key tidak valid');
      }
      throw new Error(`Unsplash API error: ${res.status}`);
    }

    const data = await res.json();

    return data.results.map(photo => ({
      id: photo.id,
      thumb: photo.urls.small,
      regular: photo.urls.regular,
      full: photo.urls.full,
      alt: photo.alt_description || query,
      author: photo.user.name,
      authorUrl: photo.user.links.html,
      color: photo.color,
      width: photo.width,
      height: photo.height
    }));
  }

  /**
   * Fallback search using Wikimedia Commons API (accurate, keyless, CORS-enabled)
   */
  async _searchFallback(query, page, perPage) {
    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('generator', 'search');
      // Search for images with query word
      url.searchParams.set('gsrsearch', `filetype:bitmap ${query}`);
      url.searchParams.set('gsrlimit', perPage.toString());
      url.searchParams.set('prop', 'imageinfo');
      url.searchParams.set('iiprop', 'url');
      url.searchParams.set('format', 'json');
      url.searchParams.set('origin', '*'); // Crucial for CORS

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Wikimedia fetch failed');

      const data = await res.json();
      
      if (!data.query || !data.query.pages) {
        // If no results, try fallback picsum
        return this._getPlaceholderResults(query, page, perPage);
      }

      const pages = Object.values(data.query.pages);
      return pages
        .filter(page => page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url)
        .map(page => {
          const imgUrl = page.imageinfo[0].url;
          // Clean title
          const title = page.title.replace('File:', '').replace(/\.[^/.]+$/, "");
          return {
            id: `wiki-${page.pageid}`,
            thumb: imgUrl,
            regular: imgUrl,
            full: imgUrl,
            alt: title || query,
            author: 'Wikimedia Commons',
            authorUrl: 'https://commons.wikimedia.org',
            color: '#FFF8E7',
            width: 600,
            height: 600
          };
        });

    } catch (err) {
      console.warn('Wikimedia search failed, using placeholders:', err);
      return this._getPlaceholderResults(query, page, perPage);
    }
  }

  /** Emergency placeholder generator */
  _getPlaceholderResults(query, page, perPage) {
    const results = [];
    const startId = ((page - 1) * perPage) + 1;
    for (let i = 0; i < perPage; i++) {
      const seed = `${query}-${startId + i}`;
      const id = Math.abs(this._hashCode(seed)) % 1000;
      results.push({
        id: `picsum-${id}`,
        thumb: `https://picsum.photos/seed/${encodeURIComponent(seed)}/300/300`,
        regular: `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/800`,
        full: `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/1200`,
        alt: query,
        author: 'Lorem Picsum (Mew)',
        authorUrl: 'https://picsum.photos',
        color: '#FFFDF5',
        width: 800,
        height: 800
      });
    }
    return results;
  }

  /** Simple string hash */
  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash;
  }

  /**
   * Convert an image URL to pencil sketch
   * @param {string} imageUrl - URL of the image
   * @param {number} blurAmount - Blur intensity (1-30, default 10)
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<HTMLCanvasElement>} Canvas with sketch result
   */
  async convertToSketch(imageUrl, blurAmount = 10, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
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

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          
          // Draw original
          ctx.drawImage(img, 0, 0, w, h);
          onProgress(20);

          // Get image data
          const imageData = ctx.getImageData(0, 0, w, h);
          const data = imageData.data;

          // Step 1: Grayscale
          const gray = new Uint8Array(w * h);
          for (let i = 0; i < data.length; i += 4) {
            const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            gray[i / 4] = g;
          }
          onProgress(35);

          // Step 2: Invert
          const inverted = new Uint8Array(w * h);
          for (let i = 0; i < gray.length; i++) {
            inverted[i] = 255 - gray[i];
          }
          onProgress(45);

          // Step 3: Gaussian-like blur (box blur, 2 passes for smoothness)
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

          // Put result back on canvas
          ctx.putImageData(imageData, 0, 0);

          // Optional: increase contrast slightly for sharper lines
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'source-over';

          onProgress(100);
          resolve(canvas);

        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        reject(new Error('Gagal memuat gambar'));
      };

      img.src = imageUrl;
    });
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
  downloadSketch(canvas, filename = 'sketsa-notered.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /** Clear search cache */
  clearCache() {
    this._cache.clear();
  }
}
