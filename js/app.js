/**
 * app.js - Main Application Entry Point
 *
 * Coordinates dictionary loadings, sets up spell checkers, editor managers,
 * sketch modules, and handles DOM bindings and screen switching.
 * Extended with Mood Tracker, Journal Prompts, Theme Picker & Affirmations.
 */

import { UI, attachSwipeClose } from "./ui.js";
import { Dictionary } from "./dictionary.js";
import { SpellChecker } from "./spellcheck.js";
import { Editor } from "./editor.js";
import { SketchSearch } from "./sketch.js";
import { Storage } from "./storage.js";
import { Export } from "./export.js";
import { KbbiApi } from "./kbbi-api.js";
import { MoodTracker } from "./mood-tracker.js";
import { kbbiParser } from "./kbbi-parser.js";
import { kbbiValidator } from "./kbbi-validator.js";

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

    // Cache settings to avoid repeated localStorage reads
    this._cachedSettings = Storage.loadSettings();

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

    // 7. Apply saved theme (use cached settings)
    this._applyTheme(this._cachedSettings.theme || "light");

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

    // Search source selector (Unsplash / Wikimedia / Openverse) — segmented buttons
    const sourceContainer = document.getElementById("settings-search-source");
    if (sourceContainer) {
      const sourceButtons = Array.from(sourceContainer.querySelectorAll(".source-seg-btn"));
      const savedSource = settings.searchSource || "unsplash";

      const applyActiveSource = (source) => {
        sourceButtons.forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.source === source);
        });
      };
      applyActiveSource(savedSource);

      sourceButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const source = btn.dataset.source;
          const curr = Storage.loadSettings();
          curr.searchSource = source;
          Storage.saveSettings(curr);
          this.sketch.setSource(source);
          this.sketch.clearCache();
          applyActiveSource(source);
          this.ui.showToast(`Sumber pencarian: ${source}`, "info");
          // Refresh current results if a query is present
          const inputSearch = document.getElementById("sketch-search-input");
          if (inputSearch && inputSearch.value.trim()) {
            this.sketch.search(inputSearch.value.trim());
          }
        });
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

    // Sketch file upload (mobile-first dropzone)
    const uploadZone = document.getElementById("sketch-upload-zone");
    const uploadInput = document.getElementById("sketch-upload-input");
    const uploadBadge = document.getElementById("sketch-upload-badge");

    const triggerUpload = () => uploadInput && uploadInput.click();
    const handleUploadFile = (file) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        this.ui.showToast("Hmm, file bukan gambar. Pilih JPG/PNG ya~", "error");
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      if (uploadBadge) {
        uploadBadge.textContent = "✓ " + (file.name || "Gambar dipilih");
        uploadBadge.hidden = false;
      }
      // Show the sketch modal acting like a photo from search
      this._openSketchModal({
        id: "upload_" + Date.now(),
        regular: objectUrl,
        thumb: objectUrl,
        alt: file.name || "Foto lokal",
        author: "Pengguna (Upload Lokal)",
        authorUrl: null,
        width: 800,
        height: 800,
      });
      // Clear input so same file can be chosen again
      uploadInput.value = "";
    };

    if (uploadZone && uploadInput) {
      // Tap / click to open picker
      uploadZone.addEventListener("click", (e) => {
        // Ignore if the click originated from the (hidden) input itself
        if (e.target === uploadInput) return;
        triggerUpload();
      });
      // Keyboard accessibility (Enter / Space)
      uploadZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          triggerUpload();
        }
      });

      // File selected
      uploadInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        handleUploadFile(file);
      });

      // Drag & drop (desktop enhancement)
      ["dragenter", "dragover"].forEach((evt) =>
        uploadZone.addEventListener(evt, (e) => {
          e.preventDefault();
          uploadZone.classList.add("dragover");
        }),
      );
      ["dragleave", "drop"].forEach((evt) =>
        uploadZone.addEventListener(evt, (e) => {
          e.preventDefault();
          uploadZone.classList.remove("dragover");
        }),
      );
      uploadZone.addEventListener("drop", (e) => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleUploadFile(file);
      });

      // Paste image from clipboard
      uploadZone.addEventListener("paste", (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            handleUploadFile(item.getAsFile());
            break;
          }
        }
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
        this.ui.showToast(`Tema ${theme} diterapkan!`, "success");
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
        ${moods
          .map(
            (m, idx) => `
          <button class="mood-btn ${todayMood && todayMood.label === m.label ? "active" : ""}" data-mood-index="${idx}" style="${todayMood && todayMood.label === m.label ? `border-color:${m.color};background:${m.bg};` : ""}">
            <span class="mood-btn-icon">${m.svg}</span>
            <span class="mood-btn-label">${m.label}</span>
          </button>
        `,
          )
          .join("")}
      </div>

      ${
        streak.count > 0
          ? `
      <div style="display:flex;justify-content:center;">
        <div class="streak-badge">
          <svg class="streak-badge-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 23c-1.5 0-3.1-.6-4.2-1.8-2.7-2.6-6.8-5.9-6.8-10.7 0-4 3.3-7.5 7-7.5 1.3 0 2.5.4 3.5 1.1V1.5c0-.6.4-1 1-1s1 .4 1 1V4c1-.7 2.2-1.1 3.5-1.1 3.7 0 7 3.4 7 7.5 0 4.7-4.1 8.1-6.8 10.7C15.1 22.4 13.5 23 12 23z"/></svg>
          <span>${streak.count} hari menulis berturut-turut!</span>
        </div>
      </div>`
          : ""
      }

      <div class="mood-section-title">Riwayat Mood 7 Hari</div>
      <div class="mood-history">
        ${history
          .map(
            (h) => `
          <div class="mood-history-item">
            <div class="mood-history-dot ${h.mood ? "filled" : ""}" style="${h.mood ? `background:${h.mood.bg};border-color:${h.mood.color};color:${h.mood.color};` : ""}">
              ${h.mood ? h.mood.svg : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="5" y1="5" x2="19" y2="19"/></svg>'}
            </div>
            <div class="mood-history-label">${h.dateLabel}</div>
          </div>
        `,
          )
          .join("")}
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
          <div class="mood-stat-number" style="font-size:0.8rem;">${stats.mostCommonMood ? stats.mostCommonMood.label : "—"}</div>
          <div class="mood-stat-label">Mood Terbanyak</div>
        </div>
        <div class="mood-stat-card">
          <div class="mood-stat-number">${streak.count}</div>
          <div class="mood-stat-label">Streak</div>
        </div>
      </div>
    `;

    // Bind mood button clicks - optimize to avoid full re-render
    container.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.moodIndex);
        this.moodTracker.setMood(idx);

        const moods = MoodTracker.getMoodOptions();
        const mood = moods[idx];

        // Update active states and clear stale inline styles from any
        // previously selected button (inline border/background beat the
        // .active class, so they must be reset to let CSS take over).
        container.querySelectorAll(".mood-btn").forEach((b, i) => {
          if (i === idx) {
            b.classList.add("active");
            b.style.borderColor = mood.color;
            b.style.background = mood.bg;
          } else {
            b.classList.remove("active");
            b.style.borderColor = "";
            b.style.background = "";
          }
        });

        // Streak may have become > 0 on first pick — show/update the badge
        // without a full re-render by re-rendering just the mood panel.
        this._renderMoodPanel();

        this.ui.showToast(`Mood hari ini: ${mood.label}`, "success");
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
        this.ui.showToast("Prompt siap ditulis! Semoga menginspirasi", "info");
      });
    }
  }

  /* --- New: Theme Application --- */

  _applyTheme(theme) {
    const root = document.documentElement;

    // Reset to defaults first
    root.style.setProperty("--bg-primary", "#FFFDF5");
    root.style.setProperty("--bg-secondary", "#FFF8E7");
    root.style.setProperty("--bg-tertiary", "#FFF3D6");
    root.style.setProperty("--bg-glass", "rgba(255, 248, 220, 0.65)");
    root.style.setProperty("--accent", "#F5C542");
    root.style.setProperty("--accent-hover", "#E8A838");
    root.style.setProperty("--accent-soft", "#FDEAB0");
    root.style.setProperty("--accent-peach", "#F5D0A9");
    root.style.setProperty("--text-primary", "#3D2E1C");
    root.style.setProperty("--text-secondary", "#8A7A66");
    root.style.setProperty("--cat-pink", "#FFB5C2");
    root.style.setProperty("--cat-cream", "#FFF0E0");
    root.style.setProperty("--border", "rgba(139, 109, 56, 0.12)");
    root.style.setProperty("--shadow", "rgba(139, 109, 56, 0.08)");
    root.style.setProperty("--shadow-lg", "rgba(139, 109, 56, 0.15)");

    // Update theme-color meta
    const metaTheme = document.querySelector('meta[name="theme-color"]');

    if (theme === "pink") {
      root.style.setProperty("--bg-primary", "#FFF0F5");
      root.style.setProperty("--bg-secondary", "#FFE8EE");
      root.style.setProperty("--bg-tertiary", "#FFDCE6");
      root.style.setProperty("--bg-glass", "rgba(255, 232, 238, 0.65)");
      root.style.setProperty("--accent", "#FFB5C2");
      root.style.setProperty("--accent-hover", "#F090A0");
      root.style.setProperty("--accent-soft", "#FFD0D8");
      root.style.setProperty("--accent-peach", "#FFC0C8");
      root.style.setProperty("--text-primary", "#5C3038");
      root.style.setProperty("--text-secondary", "#9A7078");
      root.style.setProperty("--cat-pink", "#FFB5C2");
      root.style.setProperty("--cat-cream", "#FFF0E0");
      root.style.setProperty("--border", "rgba(200, 100, 120, 0.12)");
      root.style.setProperty("--shadow", "rgba(200, 100, 120, 0.08)");
      root.style.setProperty("--shadow-lg", "rgba(200, 100, 120, 0.15)");
      if (metaTheme) metaTheme.setAttribute("content", "#FFF0F5");
    } else if (theme === "lavender") {
      root.style.setProperty("--bg-primary", "#F5F0FF");
      root.style.setProperty("--bg-secondary", "#EDE5FF");
      root.style.setProperty("--bg-tertiary", "#E5D8FF");
      root.style.setProperty("--bg-glass", "rgba(237, 229, 255, 0.65)");
      root.style.setProperty("--accent", "#C9B5FF");
      root.style.setProperty("--accent-hover", "#B095F0");
      root.style.setProperty("--accent-soft", "#DCCEFF");
      root.style.setProperty("--accent-peach", "#D0C0F5");
      root.style.setProperty("--text-primary", "#3A285C");
      root.style.setProperty("--text-secondary", "#7868A0");
      root.style.setProperty("--cat-pink", "#D0B0F0");
      root.style.setProperty("--cat-cream", "#F5EEFF");
      root.style.setProperty("--border", "rgba(100, 60, 160, 0.10)");
      root.style.setProperty("--shadow", "rgba(100, 60, 160, 0.08)");
      root.style.setProperty("--shadow-lg", "rgba(100, 60, 160, 0.15)");
      if (metaTheme) metaTheme.setAttribute("content", "#F5F0FF");
    } else if (theme === "rosegold") {
      root.style.setProperty("--bg-primary", "#FFF5F0");
      root.style.setProperty("--bg-secondary", "#FFEDE5");
      root.style.setProperty("--bg-tertiary", "#FFE0D0");
      root.style.setProperty("--bg-glass", "rgba(255, 237, 229, 0.65)");
      root.style.setProperty("--accent", "#F0A8A8");
      root.style.setProperty("--accent-hover", "#E08080");
      root.style.setProperty("--accent-soft", "#F8D0C8");
      root.style.setProperty("--accent-peach", "#F5C0B8");
      root.style.setProperty("--text-primary", "#5C3030");
      root.style.setProperty("--text-secondary", "#907070");
      root.style.setProperty("--cat-pink", "#F0C0B0");
      root.style.setProperty("--cat-cream", "#FFF0E8");
      root.style.setProperty("--border", "rgba(180, 100, 80, 0.12)");
      root.style.setProperty("--shadow", "rgba(180, 100, 80, 0.08)");
      root.style.setProperty("--shadow-lg", "rgba(180, 100, 80, 0.15)");
      if (metaTheme) metaTheme.setAttribute("content", "#FFF5F0");
    } else if (theme === "mint") {
      root.style.setProperty("--bg-primary", "#F0FFF5");
      root.style.setProperty("--bg-secondary", "#E0F8E8");
      root.style.setProperty("--bg-tertiary", "#D0F0D8");
      root.style.setProperty("--bg-glass", "rgba(224, 248, 232, 0.65)");
      root.style.setProperty("--accent", "#A8F0C0");
      root.style.setProperty("--accent-hover", "#80D8A0");
      root.style.setProperty("--accent-soft", "#C8F8D8");
      root.style.setProperty("--accent-peach", "#B8F0C8");
      root.style.setProperty("--text-primary", "#2A4A30");
      root.style.setProperty("--text-secondary", "#688070");
      root.style.setProperty("--cat-pink", "#B0D8C0");
      root.style.setProperty("--cat-cream", "#E8F8EE");
      root.style.setProperty("--border", "rgba(60, 140, 80, 0.10)");
      root.style.setProperty("--shadow", "rgba(60, 140, 80, 0.08)");
      root.style.setProperty("--shadow-lg", "rgba(60, 140, 80, 0.15)");
      if (metaTheme) metaTheme.setAttribute("content", "#F0FFF5");
    } else {
      // Light (default)
      if (metaTheme) metaTheme.setAttribute("content", "#FFFDF5");
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

    // Show bottom sheet immediately with suggestions
    this.ui.showBottomSheet({
      title: data.word,
      subtitle: subtitle,
      suggestions: data.suggestions,
      onSelect: (newWord) => data.replaceWith(newWord),
      onReplaceAll: (newWord) => data.replaceAll(data.word, newWord),
    });

    // Add definition block with loading state immediately to prevent flicker
    const contentEl = document.querySelector(".bottom-sheet-content");
    if (!contentEl) return;

    const defBlock = document.createElement("div");
    defBlock.id = "kbbi-definition-block";
    defBlock.style.marginTop = "14px";
    defBlock.style.padding = "12px 12px";
    defBlock.style.borderRadius = "12px";
    defBlock.style.background = "rgba(255,255,255,0.04)";
    defBlock.style.border = "1px solid rgba(255,255,255,0.12)";
    defBlock.innerHTML = `
      <div style="font-weight:800;color:var(--text-primary);margin-bottom:6px;">Definisi KBBI</div>
      <div style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5;">
        <em style="color:var(--text-secondary);">Memuat definisi...</em>
      </div>
    `;
    contentEl.appendChild(defBlock);

    // Now fetch definition asynchronously
    try {
      // Use dictionary's built-in definition lookup (from dictionary__JSON.json)
      // If it's a typo/tidak baku, look up the corrected word instead!
      const wordToLookup = data.bakuForm || (data.suggestions && data.suggestions.length > 0 ? data.suggestions[0] : data.word);
      const wordLower = wordToLookup.toLowerCase();
      let definition = this.dictionary.getDefinition(wordLower);

      // If not found, try original case
      if (!definition) {
        definition = this.dictionary.getDefinition(wordToLookup);
      }

      // If still not found, try capitalized
      if (!definition && wordToLookup.length > 0) {
        const capitalized = wordToLookup.charAt(0).toUpperCase() + wordToLookup.slice(1).toLowerCase();
        definition = this.dictionary.getDefinition(capitalized);
      }

      let defText = definition && definition.arti ? definition.arti : null;
      const posText = definition && definition.type ? definition.type : null;

      // Fallback: use the KBBI API lookup (validated + formatted) when the
      // in-memory dictionary does not have the word. This wires KbbiApi into
      // the live system instead of leaving it as dead code.
      if (!defText) {
        try {
          const apiResult = await KbbiApi.lookup(wordToLookup);
          if (apiResult && apiResult.def) {
            defText = apiResult.def;
            if (apiResult.isIncomplete) {
              console.warn("KBBI definition may be incomplete:", apiResult.def);
            }
          }
        } catch (apiErr) {
          console.warn("KBBI API lookup failed:", apiErr);
        }
      }

      // Resolve KBBI cross-reference definitions ("Lihat enyah", "Lihat: X",
      // "Lihat <word>"). These do not carry a real definition, so follow the
      // reference and show the target word's definition instead.
      defText = await this._resolveKbbiCrossReference(defText);

      // Validate and format definition using KBBI validator first
      let validatedDef = "";
      let formattedDef = "";
      if (defText) {
        // Step 1: Validate the raw definition text
        const validation = kbbiValidator.validate(defText);

        if (validation.isIncomplete) {
          console.warn("KBBI definition may be incomplete:", validation.warning);
        }

        if (validation.issues && validation.issues.length > 0) {
          console.warn("KBBI validation issues:", validation.issues);
        }

        // Use the validated/fixed text
        validatedDef = validation.fixedText;

        // Step 2: Format the validated definition using KBBI parser
        const parsed = kbbiParser.parse(validatedDef);
        if (parsed) {
          formattedDef = kbbiParser.format(parsed) || validatedDef;
        } else {
          // Fallback to validated text if parsing fails
          formattedDef = validatedDef;
        }
      }

      // Update the definition block with actual content
      defBlock.innerHTML = `
        <div style="font-weight:800;color:var(--text-primary);margin-bottom:6px;">Definisi KBBI</div>
        <div style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5;max-height:240px;overflow-y:auto;padding-right:4px;white-space:pre-wrap;">${formattedDef ? this._escapeHtml(formattedDef) : `<em style="color:var(--text-secondary);">Definisi tidak tersedia.</em>`}</div>
      `;
    } catch (e) {
      console.warn("KBBI lookup failed:", e);
      defBlock.innerHTML = `
        <div style="font-weight:800;color:var(--text-primary);margin-bottom:6px;">Definisi KBBI</div>
        <div style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5;">
          <em style="color:var(--text-secondary);">Gagal memuat definisi KBBI.</em>
        </div>
      `;
    }
  }

  /**
   * Resolve a KBBI cross-reference definition to the real target definition.
   *
   * Some dictionary entries don't carry their own definition — they just point
   * to another word, e.g. "Lihat enyah", "Lihat: enyah", or "lihat kata X".
   * Rendering those verbatim is useless (the user sees "Lihat enyah" with no
   * meaning). This follows the reference up to one level and returns the
   * target word's actual definition text.
   *
   * @param {string|null} defText
   * @returns {Promise<string|null>}
   */
  async _resolveKbbiCrossReference(defText) {
    if (!defText) return defText;

    // Match "Lihat", "Lihat:", "lihat" followed by the target word.
    const m = defText.match(/^\s*lihat\s*:?\s*([\p{L}\p{M}.·'-]+(?:\s[\p{L}\p{M}.·'-]+)?)/ui);
    if (!m) return defText;

    const target = m[1].trim().toLowerCase();
    if (!target || target === (this.dictionary ? '' : '')) return defText;

    // Look up the target word in the dictionary.
    let targetDef = this.dictionary.getDefinition(target);
    if (!targetDef || !targetDef.arti) {
      const capitalized = target.charAt(0).toUpperCase() + target.slice(1);
      targetDef = this.dictionary.getDefinition(capitalized);
    }
    if (!targetDef || !targetDef.arti) {
      try {
        const apiResult = await KbbiApi.lookup(target);
        if (apiResult && apiResult.def) {
          return apiResult.def;
        }
      } catch (_) {
        // fall through to original text
      }
    } else {
      return targetDef.arti;
    }

    return defText;
  }

  _updateMascotMood(mood) {
    // NOTE: the editor cat mascot SVG uses ids "eye-left-shape",
    // "eye-right-shape", and "mascot-mouth". These must match or the
    // function bails out early and the mood is never applied.
    const eyeLeft = document.getElementById("eye-left-shape");
    const eyeRight = document.getElementById("eye-right-shape");
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
      "Hai, sayang! Selamat datang di Notered~ meow!\n\n" +
        "Aku adalah kucing imut penjaga kata yang super ramah meow~ " +
        "Ketik tulisanmu di sini, ya! Kata yang salah eja akan kusorot dengan garis bawah gelombang merah " +
        "(misal: mnulis atau memotongg), sedangkan kata tidak baku akan kutunggulkan dengan garis bawah kuning " +
        "(misal: nggak atau udah).\n\n" +
        "Klik kata yang ditandai untuk melihat saran koreksi ejaan~",
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

    const buildShareItems = async () => {
      const items = [];

      // Native Web Share (share sheet OS) — best UX on mobile
      if (navigator.share) {
        items.push({
          label: "Bagikan ke Aplikasi",
          bg: "var(--accent-soft)",
          icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text-primary);"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.8 2.04.8 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.3 2.04-.8l7.05 4.12c-.05.22-.09.45-.09.68 0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3z"/></svg>`,
          onClick: async () => {
            const ok = await Export.share(text, "Notered Draft");
            if (ok) this.ui.showToast("Tulisan dibagikan (meow~)", "success");
          },
        });
      }

      items.push(
        {
          label: "Salin ke Clipboard",
          bg: "rgba(109, 191, 115, 0.18)",
          icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text-primary);"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
          onClick: async () => {
            const ok = await Export.copyToClipboard(text);
            if (ok) this.ui.showToast("Teks berhasil disalin ke clipboard", "success");
          },
        },
        {
          label: "Download File .txt",
          bg: "rgba(90, 160, 230, 0.18)",
          icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text-primary);"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
          onClick: () => {
            Export.downloadTxt(text);
            this.ui.showToast("File .txt didownload", "success");
          },
        },
        {
          label: "Download Laporan Koreksi",
          bg: "rgba(240, 168, 168, 0.18)",
          icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text-primary);"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
          onClick: () => {
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
          },
        },
      );

      return items;
    };

    const render = async () => {
      const shareItems = await buildShareItems();
      this.ui.showBottomSheet({
        isShare: true,
        title: "Bagikan Tulisan",
        subtitle: "Pilih cara membagikan tulisanmu (meow~)",
        shareItems,
      });
    };

    render();
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
      let moodSvg = "";
      try {
        const dateKey = new Date(draft.updatedAt);
        const key = dateKey.getFullYear() + "-" + String(dateKey.getMonth() + 1).padStart(2, "0") + "-" + String(dateKey.getDate()).padStart(2, "0");
        const moodLog = JSON.parse(localStorage.getItem("notered_mood_log") || "{}");
        const moodIdx = moodLog[key];
        if (moodIdx !== undefined) {
          const moods = MoodTracker.getMoodOptions();
          if (moods[moodIdx]) {
            moodSvg = '<span style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:4px;">' + moods[moodIdx].svg + "</span> ";
          }
        }
      } catch (e) {}

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

  /* --- Sketch Reference COORDINATORS (Optimized) --- */

  _sketchModalState = {
    photo: null,
    canvas: null,
    originalImg: null,
    currentBlur: 10,
    currentContrast: 10,
    reprocessTimer: null,
  };

  _initSketchModal() {
    // One-time event delegation setup – no more cloneNode!
    const overlay = document.getElementById("sketch-modal-overlay");
    if (!overlay || overlay.dataset.sketchBound) return;
    overlay.dataset.sketchBound = "true";

    // Close button
    const btnClose = document.getElementById("btn-close-sketch");
    if (btnClose) {
      btnClose.addEventListener("click", () => this._hideSketchModal());
    }

    // Mobile swipe-to-close: drag the modal card downward to dismiss.
    const sketchCard = overlay.querySelector(".sketch-modal");
    if (sketchCard) {
      attachSwipeClose(sketchCard, {
        axis: 'y',
        onClose: () => this._hideSketchModal(),
      });
    }

    // Click outside to close
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._hideSketchModal();
    });

    // Tab: Show Original
    const tabOrig = document.getElementById("tab-show-original");
    if (tabOrig) {
      tabOrig.addEventListener("click", () => {
        document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
        tabOrig.classList.add("active");
        this._renderSketchPreview("original");
      });
    }

    // Tab: Show Sketch
    const tabSketch = document.getElementById("tab-show-sketch");
    if (tabSketch) {
      tabSketch.addEventListener("click", () => {
        document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
        tabSketch.classList.add("active");
        this._renderSketchPreview("sketch");
      });
    }

    // Blur slider with debounce
    const blurSlider = document.getElementById("sketch-blur-slider");
    const blurVal = document.getElementById("slider-blur-val");
    if (blurSlider) {
      blurSlider.addEventListener("input", () => {
        this._sketchModalState.currentBlur = parseInt(blurSlider.value);
        if (blurVal) blurVal.textContent = blurSlider.value;
      });
      blurSlider.addEventListener("change", () => {
        this._debounceReprocessSketch();
      });
    }

    // Contrast slider with debounce
    const contrastSlider = document.getElementById("sketch-contrast-slider");
    const contrastVal = document.getElementById("slider-contrast-val");
    if (contrastSlider) {
      contrastSlider.addEventListener("input", () => {
        this._sketchModalState.currentContrast = parseInt(contrastSlider.value);
        if (contrastVal) contrastVal.textContent = contrastSlider.value;
      });
      contrastSlider.addEventListener("change", () => {
        this._debounceReprocessSketch();
      });
    }

    // Download button
    const btnDownload = document.getElementById("btn-download-sketch");
    if (btnDownload) {
      btnDownload.addEventListener("click", () => {
        const canvas = this._sketchModalState.canvas;
        if (canvas) {
          this.sketch.downloadSketch(canvas, `sketsa-${this._sketchModalState.photo?.id || "gambar"}.png`);
          this.ui.showToast("Sketsa diunduh ke perangkatmu!", "success");
        }
      });
    }
  }

  _debounceReprocessSketch() {
    if (this._sketchModalState.reprocessTimer) {
      clearTimeout(this._sketchModalState.reprocessTimer);
    }
    this._sketchModalState.reprocessTimer = setTimeout(() => {
      this._reprocessSketch();
    }, 400);
  }

  async _reprocessSketch() {
    const photo = this._sketchModalState.photo;
    if (!photo) return;

    const container = document.getElementById("sketch-preview-container");
    if (!container) return;

    container.innerHTML = `<div style="font-weight:700;color:var(--text-secondary);padding:20px;">Memproses ulang...</div>`;

    try {
      const { currentBlur, currentContrast } = this._sketchModalState;
      const canvas = await this.sketch.convertToSketch(photo.regular, currentBlur, currentContrast, () => {});
      this._sketchModalState.canvas = canvas;

      // If sketch tab is active, show the new canvas
      const tabSketch = document.getElementById("tab-show-sketch");
      if (tabSketch && tabSketch.classList.contains("active")) {
        document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
        tabSketch.classList.add("active");
        container.innerHTML = "";
        container.appendChild(canvas);
      }
    } catch (e) {
      console.error("Reprocess error:", e);
      this.ui.showToast("Gagal memproses ulang sketsa", "error");
    }
  }

  _renderSketchPreview(mode) {
    const container = document.getElementById("sketch-preview-container");
    if (!container) return;

    container.innerHTML = "";

    if (mode === "original" && this._sketchModalState.originalImg) {
      // Clone the img element to keep reference intact
      const imgClone = this._sketchModalState.originalImg.cloneNode(true);
      container.appendChild(imgClone);
    } else if (mode === "sketch" && this._sketchModalState.canvas) {
      container.appendChild(this._sketchModalState.canvas);
    } else {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary);">Tidak ada pratinjau.</div>`;
    }
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
    // Initialize modal event listeners once (idempotent)
    this._initSketchModal();

    const overlay = document.getElementById("sketch-modal-overlay");
    const container = document.getElementById("sketch-preview-container");
    const authorEl = document.getElementById("sketch-author-link");
    const sliderBlur = document.getElementById("sketch-blur-slider");
    const sliderContrast = document.getElementById("sketch-contrast-slider");
    const blurVal = document.getElementById("slider-blur-val");
    const contrastVal = document.getElementById("slider-contrast-val");

    if (!overlay || !container) return;

    // Store photo reference for reprocessing
    this._sketchModalState.photo = photo;
    this._sketchModalState.currentBlur = sliderBlur ? parseInt(sliderBlur.value) : 10;
    this._sketchModalState.currentContrast = sliderContrast ? parseInt(sliderContrast.value) : 10;

    overlay.classList.add("active");

    if (authorEl) {
      authorEl.textContent = photo.author;
      authorEl.href = photo.authorUrl;
    }

    // Reset slider display values
    if (blurVal) blurVal.textContent = this._sketchModalState.currentBlur;
    if (contrastVal) contrastVal.textContent = this._sketchModalState.currentContrast;

    // Activate sketch tab
    document.querySelectorAll(".sketch-modal-tab").forEach((t) => t.classList.remove("active"));
    const tabSketch = document.getElementById("tab-show-sketch");
    if (tabSketch) tabSketch.classList.add("active");

    // Show progress
    container.innerHTML = `
      <div class="sketch-progress-container">
        <div class="sketch-progress-bar-bg">
          <div class="sketch-progress-bar-fill" id="sketch-progress-bar"></div>
        </div>
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);" id="sketch-progress-label">Menghubungkan...</div>
      </div>
    `;

    const renderProgress = (percent) => {
      const bar = document.getElementById("sketch-progress-bar");
      const label = document.getElementById("sketch-progress-label");
      if (bar) bar.style.width = `${percent}%`;
      if (label) {
        if (percent < 20) label.textContent = "Memuat gambar...";
        else if (percent < 50) label.textContent = "Grayscale & filter...";
        else if (percent < 80) label.textContent = "Blurring edges...";
        else if (percent < 100) label.textContent = "Color dodging...";
        else label.textContent = "Selesai!";
      }
    };

    try {
      const { currentBlur, currentContrast } = this._sketchModalState;
      const canvas = await this.sketch.convertToSketch(photo.regular, currentBlur, currentContrast, renderProgress);
      this._sketchModalState.canvas = canvas;

      // Create original image reference
      this._sketchModalState.originalImg = new Image();
      this._sketchModalState.originalImg.src = photo.regular;
      this._sketchModalState.originalImg.className = "animate-fade-in";

      // Show sketch result
      container.innerHTML = "";
      container.appendChild(canvas);
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

  /** Decode HTML entities (e.g. < > & numeric entities) */
  _decodeHtmlEntities(str) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = str;
    return textarea.value;
  }

  /** Basic HTML sanitizer: allow safe tags only */
  _sanitizeHtml(html) {
    const allowed = new Set(["b", "i", "br", "sup", "sub", "strong", "em"]);
    const tokens = html.split(/(<\/?[a-z][a-z0-9]*\b[^>]*>)/i);
    return tokens
      .map((token) => {
        if (!token.startsWith("<")) return this._escapeHtml(token);
        const closeMatch = token.match(/^<\/([a-z]+)>$/i);
        const openMatch = token.match(/^<([a-z]+)([^>]*)>$/i);
        if (closeMatch) {
          const tag = closeMatch[1].toLowerCase();
          return allowed.has(tag) ? token : "";
        }
        if (openMatch) {
          const tag = openMatch[1].toLowerCase();
          if (!allowed.has(tag)) return "";
          const attrs = openMatch[2]
            .split(/\s+/)
            .filter((attr) => /^(href|src|style|class|id)=/i.test(attr))
            .join(" ");
          return attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
        }
        return "";
      })
      .join("");
  }
}

// Shared escapeHtml utility to avoid duplicate implementations
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Boot application when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  new App();
});
