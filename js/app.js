/**
 * app.js - Main Application Entry Point
 *
 * Coordinates dictionary loadings, sets up spell checkers, editor managers,
 * sketch modules, and handles DOM bindings and screen switching.
 * Extended with Mood Tracker, Journal Prompts, Theme Picker & Affirmations.
 */

import { UI } from "./ui.js";
import { Dictionary } from "./dictionary.js";
import { SpellChecker } from "./spellcheck.js";
import { Editor } from "./editor.js";
import { SketchSearch } from "./sketch.js";
import { Storage } from "./storage.js";
import { Export } from "./export.js";
import { KbbiApi } from "./kbbi-api.js";
import { MoodTracker } from "./mood-tracker.js";

class App {
  constructor() {
    this.ui = null;
    this.dictionary = null;
    this.spellChecker = null;
    this.editor = null;
    this.sketch = null;
    this.moodTracker = null;

    this._appLoadingScreen = null;
    this._init();
  }

  async _init() {
    this._appLoadingScreen = document.getElementById("app-loading");
    this.ui = new UI();

    // 0. Initialize Mood Tracker (for journal prompts, affirmations, streak)
    this.moodTracker = new MoodTracker();

    // 1. Initialize Dictionary & Spellcheck
    this.dictionary = new Dictionary();
    await this.dictionary.load();

    this.spellChecker = new SpellChecker(this.dictionary);
    await this.spellChecker.init();

    // 2. Initialize Sketch Search Module
    this.sketch = new SketchSearch({
      onResults: (results) => this._renderSketchResults(results),
      onLoading: (isLoading) => this._toggleSketchLoading(isLoading),
      onError: (msg) => this.ui.showToast(msg, "error"),
    });

    // 3. Initialize Text Editor
    const editorEl = document.getElementById("editor-area");
    this.editor = new Editor(editorEl, this.spellChecker, {
      onStatsUpdate: (stats) => this._updateStatsUI(stats),
      onWordClick: (data) => this._handleWordClick(data),
      onSave: () => this._onEditorSave(),
      onMascotUpdate: (mood) => this._updateMascotMood(mood),
    });

    // 4. Setup Event Listeners
    this._bindEvents();

    // 5. Restore active draft or load sample content
    this._restoreActiveDraft();

    // 6. Initialize Mood tab content
    this._renderMoodPanel();

    // 7. Apply saved theme
    this._applyTheme(Storage.loadSettings().theme || 'light');

    // 8. Hide loading screen
    if (this._appLoadingScreen) {
      this._appLoadingScreen.style.opacity = "0";
      setTimeout(() => {
        this._appLoadingScreen.style.display = "none";
      }, 500);
    }
  }

  _bindEvents() {
    // Bottom Tab Bar Routing
    document.querySelectorAll(".tab-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;
        this.ui.switchTab(tabName);

        // Contextual updates when switching tabs
        if (tabName === "draft") {
          this._renderDraftsList();
        } else if (tabName === "mood") {
          this._renderMoodPanel();
        }
      });
    });

    // Header buttons
    const btnSettings = document.getElementById("btn-settings");
    if (btnSettings) {
      btnSettings.addEventListener("click", () => this.ui.showSettings());
    }

    const btnCloseSettings = document.getElementById("btn-close-settings");
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener("click", () => this.ui.hideSettings());
    }

    const btnNewDoc = document.getElementById("btn-new-doc");
    if (btnNewDoc) {
      btnNewDoc.addEventListener("click", () => this._createNewDraft());
    }

    const btnExport = document.getElementById("btn-export-doc");
    if (btnExport) {
      btnExport.addEventListener("click", () => this._showExportSheet());
    }

    // Settings elements
    const inputApiKey = document.getElementById("settings-unsplash-key");
    const inputFontSize = document.getElementById("settings-font-size");
    const btnClearCache = document.getElementById("settings-clear-cache");

    const settings = Storage.loadSettings();
    if (inputApiKey) {
      inputApiKey.value = settings.apiKey || "";
      inputApiKey.addEventListener("change", (e) => {
        const key = e.target.value.trim();
        const curr = Storage.loadSettings();
        curr.apiKey = key;
        Storage.saveSettings(curr);
        this.sketch.setApiKey(key);
        this.ui.showToast("API Key Unsplash disimpan", "success");
      });
    }

    if (inputFontSize) {
      inputFontSize.value = settings.fontSize || 16;
      document.getElementById("editor-area").style.fontSize = `${settings.fontSize || 16}px`;

      inputFontSize.addEventListener("input", (e) => {
        const size = parseInt(e.target.value) || 16;
        const curr = Storage.loadSettings();
        curr.fontSize = size;
        Storage.saveSettings(curr);
        document.getElementById("editor-area").style.fontSize = `${size}px`;
      });
    }

    const checkboxAutocorrect = document.getElementById("settings-autocorrect");
    if (checkboxAutocorrect) {
      checkboxAutocorrect.checked = settings.autoCorrect !== false;
      checkboxAutocorrect.addEventListener("change", (e) => {
        const checked = e.target.checked;
        const curr = Storage.loadSettings();
        curr.autoCorrect = checked;
        Storage.saveSettings(curr);
        this.editor.setAutoCorrect(checked);
        this.ui.showToast(checked ? "Koreksi otomatis aktif" : "Koreksi otomatis nonaktif", "info");
      });
      this.editor.setAutoCorrect(settings.autoCorrect !== false);
    }

    if (btnClearCache) {
      btnClearCache.addEventListener("click", () => {
        indexedDB.deleteDatabase("NoteredDB");
        localStorage.clear();
        this.ui.showToast("Data & Cache dihapus. Reloading... (meow~)", "info");
        setTimeout(() => location.reload(), 1500);
      });
    }

    // Sketch searching
    const inputSearch = document.getElementById("sketch-search-input");
    if (inputSearch) {
      let debounceTimer;
      inputSearch.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.sketch.search(query);
        }, 500);
      });
    }

    // Sketch Modal controls
    const btnCloseSketch = document.getElementById("btn-close-sketch");
    if (btnCloseSketch) {
      btnCloseSketch.addEventListener("click", () => this._hideSketchModal());
    }

    const sketchOverlay = document.getElementById("sketch-modal-overlay");
    if (sketchOverlay) {
      sketchOverlay.addEventListener("click", (e) => {
        if (e.target === sketchOverlay) this._hideSketchModal();
      });
    }

    // Theme picker
    document.querySelectorAll(".theme-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const theme = opt.dataset.theme;
        this._applyTheme(theme);
        const curr = Storage.loadSettings();
        curr.theme = theme;
        Storage.saveSettings(curr);
        document.querySelectorAll(".theme-option").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        this.ui.showToast(`Tema ${theme} diterapkan! 🌸`, "success");
      });
    });
  }

  /* --- New: Mood Tracker / Journal Panel --- */

  _renderMoodPanel() {
    const container = document.getElementById("mood-panel");
    if (!container) return;

    const todayMood = this.moodTracker.getTodayMood();
    const streak = this.moodTracker.getStreak();
    const affirmation = MoodTracker.getRandomAffirmation();
    const dailyPrompt = MoodTracker.getDailyPrompt();
    const history = this.moodTracker.getMoodHistory(7);
    const stats = this.moodTracker.getStats();

    const moods = MoodTracker.getMoodOptions();

    // Time-based greeting
    const hour = new Date().getHours();
    let greeting = "Hari yang indah";
    if (hour < 11) greeting = "Selamat pagi";
    else if (hour < 15) greeting = "Selamat siang";
    else if (hour < 18) greeting = "Selamat sore";
    else greeting = "Selamat malam";

    container.innerHTML = `
      <div class="mood-greeting">
        <svg class="mood-greeting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        <span>${greeting}, cantik</span>
      </div>

      <div class="mood-affirmation">${this._escapeHtml(affirmation)}</div>

      <div class="mood-section-title">Apa kabar hatimu hari ini?</div>
      <div class="mood-grid" id="mood-grid">
        ${moods.map((m, idx) => `
          <button class="mood-btn ${todayMood && todayMood.label === m.label ? 'active' : ''}" data-mood-index="${idx}" style="${todayMood && todayMood.label === m.label ? `border-color:${m.color};background:${m.bg};` : ''}">
            <span class="mood-btn-icon">${m.svg}</span>
            <span class="mood-btn-label">${m.label}</span>
          </button>
        `).join('')}
      </div>

      ${streak.count > 0 ? `
      <div style="display:flex;justify-content:center;">
        <div class="streak-badge">
          <svg class="streak-badge-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 23c-1.5 0-3.1-.6-4.2-1.8-2.7-2.6-6.8-5.9-6.8-10.7 0-4 3.3-7.5 7-7.5 1.3 0 2.5.4 3.5 1.1V1.5c0-.6.4-1 1-1s1 .4 1 1V4c1-.7 2.2-1.1 3.5-1.1 3.7 0 7 3.4 7 7.5 0 4.7-4.1 8.1-6.8 10.7C15.1 22.4 13.5 23 12 23z"/></svg>
          <span>${streak.count} hari menulis berturut-turut!</span>
        </div>
      </div>` : ''}

      <div class="mood-section-title">Riwayat Mood 7 Hari</div>
      <div class="mood-history">
        ${history.map(h => `
          <div class="mood-history-item">
            <div class="mood-history-dot ${h.mood ? 'filled' : ''}" style="${h.mood ? `background:${h.mood.bg};border-color:${h.mood.color};color:${h.mood.color};` : ''}">
              ${h.mood ? h.mood.svg : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="5" y1="5" x2="19" y2="19"/></svg>'}
            </div>
            <div class="mood-history-label">${h.dateLabel}</div>
          </div>
        `).join('')}
      </div>

      <div class="mood-section-title">Prompt Jurnal Hari Ini</div>
      <div class="prompt-card" id="prompt-card-today">
        <div class="prompt-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div class="prompt-card-text">${this._escapeHtml(dailyPrompt)}</div>
        <svg class="prompt-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
      </div>

      <div class="mood-section-title">Statistik Jurnal</div>
      <div class="mood-stats-row">
        <div class="mood-stat-card">
          <div class="mood-stat-number">${stats.totalEntries}</div>
          <div class="mood-stat-label">Total Check-in</div>
        </div>
        <div class="mood-stat-card">
          <div class="mood-stat-icon">${stats.mostCommonMood ? stats.mostCommonMood.svg : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}</div>
          <div class="mood-stat-number" style="font-size:0.8rem;">${stats.mostCommonMood ? stats.mostCommonMood.label : '—'}</div>
          <div class="mood-stat-label">Mood Terbanyak</div>
        </div>
        <div class="mood-stat-card">
          <div class="mood-stat-number">${streak.count}</div>
          <div class="mood-stat-label">Streak</div>
        </div>
      </div>
    `;

    // Bind mood button clicks
    container.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.moodIndex);
        this.moodTracker.setMood(idx);
        this._renderMoodPanel(); // Re-render to update active state
        this.ui.showToast(`Mood hari ini: ${MoodTracker.getMoodOptions()[idx].label}`, "success");
      });
    });

    // Bind prompt click -> switch to editor tab with prompt
    const promptCard = document.getElementById("prompt-card-today");
    if (promptCard) {
      promptCard.addEventListener("click", () => {
        const currentText = this.editor.getPlainText();
        if (currentText.trim()) {
          this.editor.setContent(currentText + "\n\n📝 " + dailyPrompt + "\n");
        } else {
          this.editor.setContent("📝 " + dailyPrompt + "\n");
        }
        this.moodTracker.markWrittenToday();
        this.ui.switchTab("tulis");
        this.ui.showToast("Prompt siap ditulis! Semoga menginspirasi ✨", "info");
      });
    }
  }

  /* --- New: Theme Application --- */

  _applyTheme(theme) {
    const root = document.documentElement;

    // Reset to defaults first
    root.style.setProperty('--bg-primary', '#FFFDF5');
    root.style.setProperty('--bg-secondary', '#FFF8E7');
    root.style.setProperty('--bg-tertiary', '#FFF3D6');
    root.style.setProperty('--bg-glass', 'rgba(255, 248, 220, 0.65)');
    root.style.setProperty('--accent', '#F5C542');
    root.style.setProperty('--accent-hover', '#E8A838');
    root.style.setProperty('--accent-soft', '#FDEAB0');
    root.style.setProperty('--accent-peach', '#F5D0A9');
    root.style.setProperty('--text-primary', '#3D2E1C');
    root.style.setProperty('--text-secondary', '#8A7A66');
    root.style.setProperty('--cat-pink', '#FFB5C2');
    root.style.setProperty('--cat-cream', '#FFF0E0');
    root.style.setProperty('--border', 'rgba(139, 109, 56, 0.12)');
    root.style.setProperty('--shadow', 'rgba(139, 109, 56, 0.08)');
    root.style.setProperty('--shadow-lg', 'rgba(139, 109, 56, 0.15)');

    // Update theme-color meta
    const metaTheme = document.querySelector('meta[name="theme-color"]');

    if (theme === 'pink') {
      root.style.setProperty('--bg-primary', '#FFF0F5');
      root.style.setProperty('--bg-secondary', '#FFE8EE');
      root.style.setProperty('--bg-tertiary', '#FFDCE6');
      root.style.setProperty('--bg-glass', 'rgba(255, 232, 238, 0.65)');
      root.style.setProperty('--accent', '#FFB5C2');
      root.style.setProperty('--accent-hover', '#F090A0');
      root.style.setProperty('--accent-soft', '#FFD0D8');
      root.style.setProperty('--accent-peach', '#FFC0C8');
      root.style.setProperty('--text-primary', '#5C3038');
      root.style.setProperty('--text-secondary', '#9A7078');
      root.style.setProperty('--cat-pink', '#FFB5C2');
      root.style.setProperty('--cat-cream', '#FFF0E0');
      root.style.setProperty('--border', 'rgba(200, 100, 120, 0.12)');
      root.style.setProperty('--shadow', 'rgba(200, 100, 120, 0.08)');
      root.style.setProperty('--shadow-lg', 'rgba(200, 100, 120, 0.15)');
      if (metaTheme) metaTheme.setAttribute('content', '#FFF0F5');
    } else if (theme === 'lavender') {
      root.style.setProperty('--bg-primary', '#F5F0FF');
      root.style.setProperty('--bg-secondary', '#EDE5FF');
      root.style.setProperty('--bg-tertiary', '#E5D8FF');
      root.style.setProperty('--bg-glass', 'rgba(237, 229, 255, 0.65)');
      root.style.setProperty('--accent', '#C9B5FF');
      root.style.setProperty('--accent-hover', '#B095F0');
      root.style.setProperty('--accent-soft', '#DCCEFF');
      root.style.setProperty('--accent-peach', '#D0C0F5');
      root.style.setProperty('--text-primary', '#3A285C');
      root.style.setProperty('--text-secondary', '#7868A0');
      root.style.setProperty('--cat-pink', '#D0B0F0');
      root.style.setProperty('--cat-cream', '#F5EEFF');
      root.style.setProperty('--border', 'rgba(100, 60, 160, 0.10)');
      root.style.setProperty('--shadow', 'rgba(100, 60, 160, 0.08)');
      root.style.setProperty('--shadow-lg', 'rgba(100, 60, 160, 0.15)');
      if (metaTheme) metaTheme.setAttribute('content', '#F5F0FF');
    } else if (theme === 'rosegold') {
      root.style.setProperty('--bg-primary', '#FFF5F0');
      root.style.setProperty('--bg-secondary', '#FFEDE5');
      root.style.setProperty('--bg-tertiary', '#FFE0D0');
      root.style.setProperty('--bg-glass', 'rgba(255, 237, 229, 0.65)');
      root.style.setProperty('--accent', '#F0A8A8');
      root.style.setProperty('--accent-hover', '#E08080');
      root.style.setProperty('--accent-soft', '#F8D0C8');
      root.style.setProperty('--accent-peach', '#F5C0B8');
      root.style.setProperty('--text-primary', '#5C3030');
      root.style.setProperty('--text-secondary', '#907070');
      root.style.setProperty('--cat-pink', '#F0C0B0');
      root.style.setProperty('--cat-cream', '#FFF0E8');
      root.style.setProperty('--border', 'rgba(180, 100, 80, 0.12)');
      root.style.setProperty('--shadow', 'rgba(180, 100, 80, 0.08)');
      root.style.setProperty('--shadow-lg', 'rgba(180, 100, 80, 0.15)');
      if (metaTheme) metaTheme.setAttribute('content', '#FFF5F0');
    } else if (theme === 'mint') {
      root.style.setProperty('--bg-primary', '#F0FFF5');
      root.style.setProperty('--bg-secondary', '#E0F8E8');
      root.style.setProperty('--bg-tertiary', '#D0F0D8');
      root.style.setProperty('--bg-glass', 'rgba(224, 248, 232, 0.65)');
      root.style.setProperty('--accent', '#A8F0C0');
      root.style.setProperty('--accent-hover', '#80D8A0');
      root.style.setProperty('--accent-soft', '#C8F8D8');
      root.style.setProperty('--accent-peach', '#B8F0C8');
      root.style.setProperty('--text-primary', '#2A4A30');
      root.style.setProperty('--text-secondary', '#688070');
      root.style.setProperty('--cat-pink', '#B0D8C0');
      root.style.setProperty('--cat-cream', '#E8F8EE');
      root.style.setProperty('--border', 'rgba(60, 140, 80, 0.10)');
      root.style.setProperty('--shadow', 'rgba(60, 140, 80, 0.08)');
      root.style.setProperty('--shadow-lg', 'rgba(60, 140, 80, 0.15)');
      if (metaTheme) metaTheme.setAttribute('content', '#F0FFF5');
    } else {
      // Light (default)
      if (metaTheme) metaTheme.setAttribute('content', '#FFFDF5');
    }

    // Update active theme option in settings
    document.querySelectorAll(".theme-option").forEach((o) => {
      o.classList.toggle("active", o.dataset.theme === theme);
    });
  }

  /* --- New: On Editor Save hook --- */

  _onEditorSave() {
    this.moodTracker.markWrittenToday();
    this.ui.showToast("Draft tersimpan otomatis (meow~)", "success");
  }

  /* --- Text Editor Coordinations --- */

  _updateStatsUI(stats) {
    const pillWords = document.getElementById("stats-words");
    const pillAccuracy = document.getElementById("stats-accuracy");
    const pillReadTime = document.getElementById("stats-read-time");

    if (pillWords) pillWords.textContent = `${stats.words} kata`;
    if (pillAccuracy) pillAccuracy.textContent = `${stats.accuracy}% benar`;
    if (pillReadTime) pillReadTime.textContent = stats.readTime;
  }

  async _handleWordClick(data) {
    const subtitle = data.type === "tidak_baku" ? `Kata tidak baku. Sebaiknya gunakan: "${data.bakuForm}"` : "Kata tidak ditemukan di KBBI.";

    this.ui.showBottomSheet({
      title: data.word,
      subtitle: subtitle,
      suggestions: data.suggestions,
      onSelect: (newWord) => data.replaceWith(newWord),
      onReplaceAll: (newWord) => data.replaceAll(data.word, newWord),
    });

    try {
      const kbbi = await KbbiApi.lookup(data.word);

      const contentEl = document.querySelector(".bottom-sheet-content");
      if (!contentEl) return;

      const defBlock = document.createElement("div");
      defBlock.style.marginTop = "14px";
      defBlock.style.padding = "12px 12px";
      defBlock.style.borderRadius = "12px";
      defBlock.style.background = "rgba(255,255,255,0.04)";
      defBlock.style.border = "1px solid rgba(255,255,255,0.12)";

      const defText = kbbi && kbbi.def ? kbbi.def : null;
      const posText = kbbi && kbbi.pos ? kbbi.pos : null;
      const examples = kbbi && kbbi.examples ? kbbi.examples : [];

      defBlock.innerHTML = `
        <div style="font-weight:800;color:var(--text-primary);margin-bottom:6px;">Definisi KBBI</div>
        <div style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5;">
          ${posText ? `<div style="margin-bottom:6px;"><strong style="color:var(--text-primary);">Kata kelas:</strong> ${this._escapeHtml(posText)}</div>` : ``}
          ${defText ? this._escapeHtml(defText) : `<em style="color:var(--text-secondary);">Definisi tidak tersedia.</em>`}
        </div>
        ${
          examples && examples.length
            ? `
          <div style="margin-top:10px;color:var(--text-secondary);font-size:0.85rem;">
            <div style="font-weight:700;color:var(--text-primary);margin-bottom:4px;">Contoh</div>
            ${examples
              .slice(0, 3)
              .map((ex) => `<div>• ${this._escapeHtml(ex)}</div>`)
              .join("")}
          </div>
        `
            : ``
        }
      `;

      contentEl.appendChild(defBlock);
    } catch (e) {
      console.warn("KBbi lookup failed:", e);
      const contentEl = document.querySelector(".bottom-sheet-content");
      if (!contentEl) return;
      const errBlock = document.createElement("div");
      errBlock.style.marginTop = "14px";
      errBlock.style.color = "var(--text-secondary)";
      errBlock.style.fontSize = "0.85rem";
      errBlock.textContent = "Gagal memuat definisi KBBI (GitHub).";
      contentEl.appendChild(errBlock);
    }
  }

  _updateMascotMood(mood) {
    const eyeLeft = document.getElementById("mascot-eye-left");
    const eyeRight = document.getElementById("mascot-eye-right");
    const mouth = document.getElementById("mascot-mouth");

    if (!eyeLeft || !eyeRight || !mouth) return;

    if (mood === "happy") {
      eyeLeft.setAttribute("d", "M 14,14 A 2,2 0 0,1 18,14");
      eyeRight.setAttribute("d", "M 22,14 A 2,2 0 0,1 26,14");
      mouth.setAttribute("d", "M 17,21 Q 20,24 23,21");
    } else if (mood === "worried") {
      eyeLeft.setAttribute("d", "M 13,13 L 17,15");
      eyeRight.setAttribute("d", "M 27,13 L 23,15");
      mouth.setAttribute("d", "M 18,22 Q 20,20 22,22");
    } else {
      eyeLeft.setAttribute("d", "M 15 15 A 1.5 1.5 0 1 1 15 14.9");
      eyeRight.setAttribute("d", "M 25 15 A 1.5 1.5 0 1 1 25 14.9");
      mouth.setAttribute("d", "M 18,20 Q 20,22 22,20");
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

    this.editor.setContent(
      "Halo! Selamat datang di Notered. meow~\n\n" +
        "Ini adalah asisten menulis Bahasa Indonesia per kata. " +
        "Ketik tulisanmu di sini. Kata yang salah eja akan di-highlight garis bawah gelombang merah " +
        "(misal: mnulis atau memotongg), sedangkan kata tidak baku akan bergaris bawah kuning " +
        "(misal: nggak atau udah).\n\n" +
        "Klik kata yang ditandai untuk melihat saran koreksi ejaan dari KBBI!",
    );
  }

  _createNewDraft() {
    this.editor.clear();
    const newId = Storage.generateId();
    Storage.setActiveDraftId(newId);
    this.editor.focus();
    this.ui.showToast("Membuat draft baru (meow~)", "info");
  }

  _showExportSheet() {
    const text = this.editor.getPlainText();
    if (!text.trim()) {
      this.ui.showToast("Tulisan kosong, belum ada yang bisa diexport ya (meow~)", "error");
      return;
    }

    this.ui.showBottomSheet({
      title: "Bagikan Tulisan",
      subtitle: "Pilih format export tulisanmu",
      suggestions: ["Copy ke Clipboard", "Download File .txt", "Download Laporan Koreksi"],
      onSelect: async (option) => {
        if (option === "Copy ke Clipboard") {
          const ok = await Export.copyToClipboard(text);
          if (ok) this.ui.showToast("Teks berhasil disalin ke clipboard", "success");
        } else if (option === "Download File .txt") {
          Export.downloadTxt(text);
          this.ui.showToast("File .txt didownload", "success");
        } else if (option === "Download Laporan Koreksi") {
          const errs = [];
          const spans = document.querySelectorAll(".word-error, .word-warning");
          spans.forEach((span) => {
            errs.push({
              word: span.dataset.word,
              type: span.classList.contains("word-error") ? "error" : "tidak_baku",
              suggestions: JSON.parse(span.dataset.suggestions || "[]"),
            });
          });
          Export.downloadReport(text, errs);
          this.ui.showToast("Laporan koreksi diunduh", "success");
        }
      },
    });
  }

  /* --- Draft Tab Manager --- */

  _renderDraftsList() {
    const container = document.getElementById("drafts-list-container");
    if (!container) return;

    container.innerHTML = "";
    const drafts = Storage.listDrafts();

    if (drafts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          <p>Belum ada draft tersimpan. Yuk mulai dulu ya, (meow~) </p>
          <button class="capsule-btn" id="btn-drafts-create" style="margin-top:8px;">Tulis Sekarang (Mew!)</button>
        </div>
      `;
      const btn = document.getElementById("btn-drafts-create");
      if (btn)
        btn.addEventListener("click", () => {
          this.ui.switchTab("tulis");
          this._createNewDraft();
        });
      return;
    }

    drafts.forEach((draft) => {
      const card = document.createElement("div");
      card.className = "draft-card";

      const date = new Date(draft.updatedAt).toLocaleDateString("id-ID", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Check if this draft has a mood associated (from the date it was saved)
      let moodSvg = '';
      try {
        const dateKey = new Date(draft.updatedAt);
        const key = dateKey.getFullYear() + '-' + String(dateKey.getMonth()+1).padStart(2,'0') + '-' + String(dateKey.getDate()).padStart(2,'0');
        const moodLog = JSON.parse(localStorage.getItem('notered_mood_log') || '{}');
        const moodIdx = moodLog[key];
        if (moodIdx !== undefined) {
          const moods = MoodTracker.getMoodOptions();
          if (moods[moodIdx]) {
            moodSvg = '<span style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:4px;">' + moods[moodIdx].svg + '</span> ';
          }
        }
      } catch(e) {}

      card.innerHTML = `
        <div class="draft-info">
          <div class="draft-title">${moodSvg}${this._escapeHtml(draft.title)}</div>
          <div class="draft-meta">${draft.wordCount} kata • Diperbarui ${date}</div>
        </div>
        <button class="icon-btn btn-delete-draft" data-id="${draft.id}" title="Hapus draft">
          <svg style="fill: var(--error);" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".btn-delete-draft")) return;

        Storage.setActiveDraftId(draft.id);
        this.editor.setHtmlContent(draft.htmlContent || draft.content);
        this.ui.switchTab("tulis");
        this.ui.showToast(`Draft "${draft.title}" dimuat (mew!)`, "info");
      });

      const deleteBtn = card.querySelector(".btn-delete-draft");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = deleteBtn.dataset.id;
          if (confirm("Hapus draft ini secara permanen?")) {
            Storage.deleteDraft(id);
            this._renderDraftsList();
            this.ui.showToast("Draft dihapus (si kucing ngelus-ngelus pembersihan)", "info");
          }
        });
      }

      container.appendChild(card);
    });
  }

  /* --- Sketch Reference COORDINATORS --- */

  _renderSketchResults(results) {
    const grid = document.getElementById("sketch-results-grid");
    if (!grid) return;

    grid.innerHTML = "";

    if (results.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <p>Ketik kata kunci untuk mencari referensi gambar (meow~)</p>
          <p style="font-size:0.8rem;margin-top:2px;">Contoh: bunga mawar, kucing persia, rumah klasik</p>
        </div>
      `;
      return;
    }

    results.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "sketch-card";

      card.innerHTML = `
        <img src="${photo.thumb}" alt="${this._escapeHtml(photo.alt)}" loading="lazy" style="background-color: ${photo.color};">
        <div class="sketch-card-author">oleh ${this._escapeHtml(photo.author)}</div>
      `;

      card.addEventListener("click", () => this._openSketchModal(photo));

      grid.appendChild(card);
    });
  }

  _toggleSketchLoading(isLoading) {
    const grid = document.getElementById("sketch-results-grid");
    if (!grid) return;

    if (isLoading) {
      grid.innerHTML = "";
      for (let i = 0; i < 8; i++) {
        const skeleton = document.createElement("div");
        skeleton.className = "sketch-card loading-shimmer";
        grid.appendChild(skeleton);
      }
    }
  }

  async _openSketchModal(photo) {
    const overlay = document.getElementById("sketch-modal-overlay");
    const container = document.getElementById("sketch-preview-container");
    const authorEl = document.getElementById("sketch-author-link");
    const sliderBlur = document.getElementById("sketch-blur-slider");
    const btnDownload = document.getElementById("btn-download-sketch");

    if (!overlay || !container) return;

    overlay.classList.add("active");

    if (authorEl) {
      authorEl.textContent = photo.author;
      authorEl.href = photo.authorUrl;
    }

    document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
    const tabSketch = document.getElementById("tab-show-sketch");
    if (tabSketch) tabSketch.classList.add("active");

    container.innerHTML = `
      <div class="sketch-progress-container">
        <div class="sketch-progress-bar-bg">
          <div class="sketch-progress-bar-fill" id="sketch-progress-bar"></div>
        </div>
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);" id="sketch-progress-label">Menghubungkan...</div>
      </div>
    `;

    let sketchCanvas = null;
    let originalImgEl = null;

    const renderProgress = (percent) => {
      const bar = document.getElementById("sketch-progress-bar");
      const label = document.getElementById("sketch-progress-label");
      if (bar) bar.style.width = `${percent}%`;
      if (label) {
        if (percent < 20) label.textContent = "Memuat gambar...";
        else if (percent < 50) label.textContent = "Grayscale & filter...";
        else if (percent < 80) label.textContent = "Blurting edges...";
        else if (percent < 100) label.textContent = "Color dodging...";
        else label.textContent = "Selesai!";
      }
    };

    try {
      const blurVal = sliderBlur ? parseInt(sliderBlur.value) : 10;
      sketchCanvas = await this.sketch.convertToSketch(photo.regular, blurVal, renderProgress);

      originalImgEl = new Image();
      originalImgEl.src = photo.regular;
      originalImgEl.className = "animate-fade-in";

      container.innerHTML = "";
      container.appendChild(sketchCanvas);

      const tabOrig = document.getElementById("tab-show-original");
      if (tabOrig) {
        tabOrig.replaceWith(tabOrig.cloneNode(true));
        document.getElementById("tab-show-original").addEventListener("click", () => {
          document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
          document.getElementById("tab-show-original").classList.add("active");
          container.innerHTML = "";
          container.appendChild(originalImgEl);
        });
      }

      if (tabSketch) {
        tabSketch.replaceWith(tabSketch.cloneNode(true));
        document.getElementById("tab-show-sketch").addEventListener("click", () => {
          document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
          document.getElementById("tab-show-sketch").classList.add("active");
          container.innerHTML = "";
          container.appendChild(sketchCanvas);
        });
      }

      if (sliderBlur) {
        sliderBlur.replaceWith(sliderBlur.cloneNode(true));
        const newSlider = document.getElementById("sketch-blur-slider");
        newSlider.addEventListener("change", async () => {
          const val = parseInt(newSlider.value);
          container.innerHTML = `<div style="font-weight:700;color:var(--text-secondary);">Memproses ulang...</div>`;
          try {
            sketchCanvas = await this.sketch.convertToSketch(photo.regular, val, () => {});
            document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
            document.getElementById("tab-show-sketch").classList.add("active");
            container.innerHTML = "";
            container.appendChild(sketchCanvas);
          } catch (e) {
            this.ui.showToast("Gagal memproses ulang sketsa", "error");
          }
        });
      }

      if (btnDownload) {
        btnDownload.replaceWith(btnDownload.cloneNode(true));
        const newDownload = document.getElementById("btn-download-sketch");
        newDownload.addEventListener("click", () => {
          this.sketch.downloadSketch(sketchCanvas, `sketsa-${photo.id}.png`);
          this.ui.showToast("Sketsa diunduh ke perangkatmu!", "success");
        });
      }
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--error);font-weight:700;">Gagal memproses gambar ke sketsa. Coba gambar lain.</div>`;
    }
  }

  _hideSketchModal() {
    const overlay = document.getElementById("sketch-modal-overlay");
    if (overlay) overlay.classList.remove("active");
  }

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

// Boot application when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  new App();
});