/**
 * app.js - Main Application Entry Point
 * 
 * Coordinates dictionary loadings, sets up spell checkers, editor managers,
 * sketch modules, and handles DOM bindings and screen switching.
 */

import { UI } from './ui.js';
import { Dictionary } from './dictionary.js';
import { SpellChecker } from './spellcheck.js';
import { Editor } from './editor.js';
import { SketchSearch } from './sketch.js';
import { Storage } from './storage.js';
import { Export } from './export.js';

class App {
  constructor() {
    this.ui = null;
    this.dictionary = null;
    this.spellChecker = null;
    this.editor = null;
    this.sketch = null;
    
    this._appLoadingScreen = null;
    this._init();
  }

  async _init() {
    this._appLoadingScreen = document.getElementById('app-loading');
    this.ui = new UI();
    
    // 1. Initialize Dictionary & Spellcheck
    this.dictionary = new Dictionary();
    await this.dictionary.load();
    
    this.spellChecker = new SpellChecker(this.dictionary);
    await this.spellChecker.init();

    // 2. Initialize Sketch Search Module
    this.sketch = new SketchSearch({
      onResults: (results) => this._renderSketchResults(results),
      onLoading: (isLoading) => this._toggleSketchLoading(isLoading),
      onError: (msg) => this.ui.showToast(msg, 'error')
    });

    // 3. Initialize Text Editor
    const editorEl = document.getElementById('editor-area');
    this.editor = new Editor(editorEl, this.spellChecker, {
      onStatsUpdate: (stats) => this._updateStatsUI(stats),
      onWordClick: (data) => this._handleWordClick(data),
      onSave: () => this.ui.showToast('Draft disimpan otomatis', 'success'),
      onMascotUpdate: (mood) => this._updateMascotMood(mood)
    });

    // 4. Setup Event Listeners
    this._bindEvents();

    // 5. Restore active draft or load sample content
    this._restoreActiveDraft();

    // 6. Hide loading screen
    if (this._appLoadingScreen) {
      this._appLoadingScreen.style.opacity = '0';
      setTimeout(() => {
        this._appLoadingScreen.style.display = 'none';
      }, 500);
    }
  }

  _bindEvents() {
    // Bottom Tab Bar Routing
    document.querySelectorAll('.tab-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        this.ui.switchTab(tabName);
        
        // Contextual updates when switching tabs
        if (tabName === 'draft') {
          this._renderDraftsList();
        }
      });
    });

    // Header buttons
    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => this.ui.showSettings());
    }

    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => this.ui.hideSettings());
    }

    const btnNewDoc = document.getElementById('btn-new-doc');
    if (btnNewDoc) {
      btnNewDoc.addEventListener('click', () => this._createNewDraft());
    }

    const btnExport = document.getElementById('btn-export-doc');
    if (btnExport) {
      btnExport.addEventListener('click', () => this._showExportSheet());
    }

    // Settings elements
    const inputApiKey = document.getElementById('settings-unsplash-key');
    const inputFontSize = document.getElementById('settings-font-size');
    const btnClearCache = document.getElementById('settings-clear-cache');

    const settings = Storage.loadSettings();
    if (inputApiKey) {
      inputApiKey.value = settings.apiKey || '';
      inputApiKey.addEventListener('change', (e) => {
        const key = e.target.value.trim();
        const curr = Storage.loadSettings();
        curr.apiKey = key;
        Storage.saveSettings(curr);
        this.sketch.setApiKey(key);
        this.ui.showToast('API Key Unsplash disimpan', 'success');
      });
    }

    if (inputFontSize) {
      inputFontSize.value = settings.fontSize || 16;
      // Set editor font size initially
      document.getElementById('editor-area').style.fontSize = `${settings.fontSize || 16}px`;

      inputFontSize.addEventListener('input', (e) => {
        const size = parseInt(e.target.value) || 16;
        const curr = Storage.loadSettings();
        curr.fontSize = size;
        Storage.saveSettings(curr);
        document.getElementById('editor-area').style.fontSize = `${size}px`;
      });
    }

    const checkboxAutocorrect = document.getElementById('settings-autocorrect');
    if (checkboxAutocorrect) {
      checkboxAutocorrect.checked = settings.autoCorrect !== false;
      checkboxAutocorrect.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const curr = Storage.loadSettings();
        curr.autoCorrect = checked;
        Storage.saveSettings(curr);
        this.editor.setAutoCorrect(checked);
        this.ui.showToast(checked ? 'Koreksi otomatis aktif' : 'Koreksi otomatis nonaktif', 'info');
      });
      // Pass initial state to Editor
      this.editor.setAutoCorrect(settings.autoCorrect !== false);
    }

    if (btnClearCache) {
      btnClearCache.addEventListener('click', () => {
        indexedDB.deleteDatabase('NoteredDB');
        localStorage.clear();
        this.ui.showToast('Data & Cache dihapus. Reloading...', 'info');
        setTimeout(() => location.reload(), 1500);
      });
    }

    // Sketch searching
    const inputSearch = document.getElementById('sketch-search-input');
    if (inputSearch) {
      let debounceTimer;
      inputSearch.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.sketch.search(query);
        }, 500);
      });
    }

    // Sketch Modal controls
    const btnCloseSketch = document.getElementById('btn-close-sketch');
    if (btnCloseSketch) {
      btnCloseSketch.addEventListener('click', () => this._hideSketchModal());
    }

    const sketchOverlay = document.getElementById('sketch-modal-overlay');
    if (sketchOverlay) {
      sketchOverlay.addEventListener('click', (e) => {
        if (e.target === sketchOverlay) this._hideSketchModal();
      });
    }
  }

  /* --- Text Editor Coordinations --- */

  _updateStatsUI(stats) {
    // Updates footer statistics pills
    const pillWords = document.getElementById('stats-words');
    const pillAccuracy = document.getElementById('stats-accuracy');
    const pillReadTime = document.getElementById('stats-read-time');

    if (pillWords) pillWords.textContent = `${stats.words} kata`;
    if (pillAccuracy) pillAccuracy.textContent = `${stats.accuracy}% benar`;
    if (pillReadTime) pillReadTime.textContent = stats.readTime;
  }

  _handleWordClick(data) {
    const subtitle = data.type === 'tidak_baku' 
      ? `Kata tidak baku. Sebaiknya gunakan: "${data.bakuForm}"`
      : 'Kata tidak ditemukan di KBBI.';

    this.ui.showBottomSheet({
      title: data.word,
      subtitle: subtitle,
      suggestions: data.suggestions,
      onSelect: (newWord) => data.replaceWith(newWord),
      onReplaceAll: (newWord) => data.replaceAll(data.word, newWord)
    });
  }

  _updateMascotMood(mood) {
    const eyeLeft = document.getElementById('mascot-eye-left');
    const eyeRight = document.getElementById('mascot-eye-right');
    const mouth = document.getElementById('mascot-mouth');

    if (!eyeLeft || !eyeRight || !mouth) return;

    if (mood === 'happy') {
      // Happy curved eyes
      eyeLeft.setAttribute('d', 'M 14,14 A 2,2 0 0,1 18,14');
      eyeRight.setAttribute('d', 'M 22,14 A 2,2 0 0,1 26,14');
      mouth.setAttribute('d', 'M 17,21 Q 20,24 23,21');
    } else if (mood === 'worried') {
      // Worried slanted eyes
      eyeLeft.setAttribute('d', 'M 13,13 L 17,15');
      eyeRight.setAttribute('d', 'M 27,13 L 23,15');
      mouth.setAttribute('d', 'M 18,22 Q 20,20 22,22');
    } else {
      // Neutral dots
      eyeLeft.setAttribute('d', 'M 15 15 A 1.5 1.5 0 1 1 15 14.9');
      eyeRight.setAttribute('d', 'M 25 15 A 1.5 1.5 0 1 1 25 14.9');
      mouth.setAttribute('d', 'M 18,20 Q 20,22 22,20');
    }
  }

  _restoreActiveDraft() {
    const activeId = Storage.getActiveDraftId();
    if (activeId) {
      const draft = Storage.loadDraft(activeId);
      if (draft) {
        this.editor.setHtmlContent(draft.htmlContent || draft.content);
        return;
      }
    }

    // Fallback: create initial welcome draft
    this.editor.setContent(
      "Halo! Selamat datang di Notered. meow~\n\n" +
      "Ini adalah asisten menulis Bahasa Indonesia per kata. " +
      "Ketik tulisanmu di sini. Kata yang salah eja akan di-highlight garis bawah gelombang merah " +
      "(misal: mnulis atau memotongg), sedangkan kata tidak baku akan bergaris bawah kuning " +
      "(misal: nggak atau udah).\n\n" +
      "Klik kata yang ditandai untuk melihat saran koreksi ejaan dari KBBI!"
    );
  }

  _createNewDraft() {
    this.editor.clear();
    const newId = Storage.generateId();
    Storage.setActiveDraftId(newId);
    this.editor.focus();
    this.ui.showToast('Membuat draft baru', 'info');
  }

  _showExportSheet() {
    const text = this.editor.getPlainText();
    if (!text.trim()) {
      this.ui.showToast('Tulisan kosong, tidak ada yang diexport', 'error');
      return;
    }

    this.ui.showBottomSheet({
      title: 'Bagikan Tulisan',
      subtitle: 'Pilih format export tulisanmu',
      suggestions: ['Copy ke Clipboard', 'Download File .txt', 'Download Laporan Koreksi'],
      onSelect: async (option) => {
        if (option === 'Copy ke Clipboard') {
          const ok = await Export.copyToClipboard(text);
          if (ok) this.ui.showToast('Teks berhasil disalin ke clipboard', 'success');
        } else if (option === 'Download File .txt') {
          Export.downloadTxt(text);
          this.ui.showToast('File .txt didownload', 'success');
        } else if (option === 'Download Laporan Koreksi') {
          // Gather spelling errors from highlights
          const errs = [];
          const spans = document.querySelectorAll('.word-error, .word-warning');
          spans.forEach(span => {
            errs.push({
              word: span.dataset.word,
              type: span.classList.contains('word-error') ? 'error' : 'tidak_baku',
              suggestions: JSON.parse(span.dataset.suggestions || '[]')
            });
          });
          Export.downloadReport(text, errs);
          this.ui.showToast('Laporan koreksi diunduh', 'success');
        }
      }
    });
  }

  /* --- Draft Tab Manager --- */

  _renderDraftsList() {
    const container = document.getElementById('drafts-list-container');
    if (!container) return;

    container.innerHTML = '';
    const drafts = Storage.listDrafts();

    if (drafts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          <p>Belum ada draft tersimpan</p>
          <button class="capsule-btn" id="btn-drafts-create" style="margin-top:8px;">Tulis Sekarang</button>
        </div>
      `;
      const btn = document.getElementById('btn-drafts-create');
      if (btn) btn.addEventListener('click', () => {
        this.ui.switchTab('tulis');
        this._createNewDraft();
      });
      return;
    }

    drafts.forEach(draft => {
      const card = document.createElement('div');
      card.className = 'draft-card';
      
      const date = new Date(draft.updatedAt).toLocaleDateString('id-ID', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      card.innerHTML = `
        <div class="draft-info">
          <div class="draft-title">${this._escapeHtml(draft.title)}</div>
          <div class="draft-meta">${draft.wordCount} kata • Diperbarui ${date}</div>
        </div>
        <button class="icon-btn btn-delete-draft" data-id="${draft.id}" title="Hapus draft">
          <svg style="fill: var(--error);" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;

      // Click card -> Open draft in editor
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-draft')) return; // Avoid bubble
        
        Storage.setActiveDraftId(draft.id);
        this.editor.setHtmlContent(draft.htmlContent || draft.content);
        this.ui.switchTab('tulis');
        this.ui.showToast(`Draft "${draft.title}" dimuat`, 'info');
      });

      // Click delete button -> remove draft
      const deleteBtn = card.querySelector('.btn-delete-draft');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = deleteBtn.dataset.id;
          if (confirm('Hapus draft ini secara permanen?')) {
            Storage.deleteDraft(id);
            this._renderDraftsList();
            this.ui.showToast('Draft dihapus', 'info');
          }
        });
      }

      container.appendChild(card);
    });
  }

  /* --- Sketch Reference COORDINATORS --- */

  _renderSketchResults(results) {
    const grid = document.getElementById('sketch-results-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (results.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <p>Ketik kata kunci untuk mencari referensi gambar</p>
          <p style="font-size:0.8rem;margin-top:2px;">Contoh: bunga mawar, kucing persia, rumah klasik</p>
        </div>
      `;
      return;
    }

    results.forEach(photo => {
      const card = document.createElement('div');
      card.className = 'sketch-card';
      
      card.innerHTML = `
        <img src="${photo.thumb}" alt="${this._escapeHtml(photo.alt)}" loading="lazy" style="background-color: ${photo.color};">
        <div class="sketch-card-author">oleh ${this._escapeHtml(photo.author)}</div>
      `;

      card.addEventListener('click', () => this._openSketchModal(photo));

      grid.appendChild(card);
    });
  }

  _toggleSketchLoading(isLoading) {
    const grid = document.getElementById('sketch-results-grid');
    if (!grid) return;

    if (isLoading) {
      grid.innerHTML = '';
      for (let i = 0; i < 8; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'sketch-card loading-shimmer';
        grid.appendChild(skeleton);
      }
    }
  }

  async _openSketchModal(photo) {
    const overlay = document.getElementById('sketch-modal-overlay');
    const container = document.getElementById('sketch-preview-container');
    const authorEl = document.getElementById('sketch-author-link');
    const sliderBlur = document.getElementById('sketch-blur-slider');
    const btnDownload = document.getElementById('btn-download-sketch');
    
    if (!overlay || !container) return;

    overlay.classList.add('active');
    
    if (authorEl) {
      authorEl.textContent = photo.author;
      authorEl.href = photo.authorUrl;
    }

    // Set tab states defaults (Sketch is main)
    document.querySelectorAll('.sketch-modal-tab').forEach(t => t.classList.remove('active'));
    const tabSketch = document.getElementById('tab-show-sketch');
    if (tabSketch) tabSketch.classList.add('active');

    // Display image loading progress
    container.innerHTML = `
      <div class="sketch-progress-container">
        <div class="sketch-progress-bar-bg">
          <div class="sketch-progress-bar-fill" id="sketch-progress-bar"></div>
        </div>
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);" id="sketch-progress-label">Menghubungkan...</div>
      </div>
    `;

    // Process image to sketch
    let sketchCanvas = null;
    let originalImgEl = null;

    const renderProgress = (percent) => {
      const bar = document.getElementById('sketch-progress-bar');
      const label = document.getElementById('sketch-progress-label');
      if (bar) bar.style.width = `${percent}%`;
      if (label) {
        if (percent < 20) label.textContent = 'Memuat gambar...';
        else if (percent < 50) label.textContent = 'Grayscale & filter...';
        else if (percent < 80) label.textContent = 'Blurting edges...';
        else if (percent < 100) label.textContent = 'Color dodging...';
        else label.textContent = 'Selesai!';
      }
    };

    try {
      // 1. Process sketch
      const blurVal = sliderBlur ? parseInt(sliderBlur.value) : 10;
      sketchCanvas = await this.sketch.convertToSketch(photo.regular, blurVal, renderProgress);

      // 2. Preload original image for toggle tab
      originalImgEl = new Image();
      originalImgEl.src = photo.regular;
      originalImgEl.className = 'animate-fade-in';

      // Show sketch by default
      container.innerHTML = '';
      container.appendChild(sketchCanvas);

      // 3. Register switch tabs between Original and Sketch
      const tabOrig = document.getElementById('tab-show-original');
      if (tabOrig) {
        tabOrig.replaceWith(tabOrig.cloneNode(true)); // Clear old listeners
        document.getElementById('tab-show-original').addEventListener('click', () => {
          document.querySelectorAll('.sketch-modal-tab').forEach(t => t.classList.remove('active'));
          document.getElementById('tab-show-original').classList.add('active');
          container.innerHTML = '';
          container.appendChild(originalImgEl);
        });
      }

      if (tabSketch) {
        tabSketch.replaceWith(tabSketch.cloneNode(true));
        document.getElementById('tab-show-sketch').addEventListener('click', () => {
          document.querySelectorAll('.sketch-modal-tab').forEach(t => t.classList.remove('active'));
          document.getElementById('tab-show-sketch').classList.add('active');
          container.innerHTML = '';
          container.appendChild(sketchCanvas);
        });
      }

      // 4. Register slider updates
      if (sliderBlur) {
        sliderBlur.replaceWith(sliderBlur.cloneNode(true)); // Clear listeners
        const newSlider = document.getElementById('sketch-blur-slider');
        newSlider.addEventListener('change', async () => {
          const val = parseInt(newSlider.value);
          // Show quick re-process loader
          container.innerHTML = `<div style="font-weight:700;color:var(--text-secondary);">Memproses ulang...</div>`;
          try {
            sketchCanvas = await this.sketch.convertToSketch(photo.regular, val, () => {});
            // Switch to sketch tab view
            document.querySelectorAll('.sketch-modal-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('tab-show-sketch').classList.add('active');
            container.innerHTML = '';
            container.appendChild(sketchCanvas);
          } catch (e) {
            this.ui.showToast('Gagal memproses ulang sketsa', 'error');
          }
        });
      }

      // 5. Register download
      if (btnDownload) {
        btnDownload.replaceWith(btnDownload.cloneNode(true));
        const newDownload = document.getElementById('btn-download-sketch');
        newDownload.addEventListener('click', () => {
          this.sketch.downloadSketch(sketchCanvas, `sketsa-${photo.id}.png`);
          this.ui.showToast('Sketsa diunduh ke perangkatmu!', 'success');
        });
      }

    } catch (err) {
      console.error(err);
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--error);font-weight:700;">Gagal memproses gambar ke sketsa. Coba gambar lain.</div>`;
    }
  }

  _hideSketchModal() {
    const overlay = document.getElementById('sketch-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
