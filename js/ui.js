/**
 * ui.js - Main User Interface Controller for Notered
 *
 * Manages modal overlays, slide-up bottom sheets, floating settings panels,
 * active tab switching, and animations.
 */

export class UI {
  constructor() {
    this._toastContainer = null;
    this._bottomSheet = null;
    this._bottomSheetOverlay = null;
    this._settingsPanel = null;
    this._settingsOverlay = null;

    this._initElements();
  }

  /** Locate common elements */
  _initElements() {
    // Create toast container dynamically if not exists
    this._toastContainer = document.getElementById("toast-container");
    if (!this._toastContainer) {
      this._toastContainer = document.createElement("div");
      this._toastContainer.id = "toast-container";
      this._toastContainer.className = "toast-container";
      document.body.appendChild(this._toastContainer);
    }

    this._bottomSheet = document.getElementById("bottom-sheet");
    this._bottomSheetOverlay = document.getElementById("bottom-sheet-overlay");
    this._settingsPanel = document.getElementById("settings-panel");
    this._settingsOverlay = document.getElementById("settings-overlay");

    // Register click handlers for closing overlays
    if (this._bottomSheetOverlay) {
      this._bottomSheetOverlay.addEventListener("click", () => this.hideBottomSheet());
    }
    if (this._settingsOverlay) {
      this._settingsOverlay.addEventListener("click", () => this.hideSettings());
    }
  }

  /**
   * Display a quick toast alert with cat accents
   * @param {string} message - Text notification message
   * @param {string} type - Toast type ('success' | 'error' | 'info')
   */
  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = "toast";

    // Choose paw/cat SVG icon depending on toast type
    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg class="toast-icon" style="fill: var(--success)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg class="toast-icon" style="fill: var(--error)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    } else {
      // Default: Cat Paw symbol
      iconSvg = `<svg class="toast-icon" style="fill: var(--accent)" viewBox="0 0 24 24"><path d="M12 14c-1.66 0-3 1.34-3 3 0 2 2 3.5 3 5 1-1.5 3-3 3-5 0-1.66-1.34-3-3-3zm-4.5-2.5c-.83 0-1.5-.67-1.5-1.5 0-.83.67-1.5 1.5-1.5.83 0 1.5.67 1.5 1.5 0 .83-.67 1.5-1.5 1.5zm9 0c-.83 0-1.5-.67-1.5-1.5 0-.83.67-1.5 1.5-1.5.83 0 1.5.67 1.5 1.5 0 .83-.67 1.5-1.5 1.5zm-8.5-5C7.17 6.5 6.5 5.83 6.5 5c0-.83.67-1.5 1.5-1.5.83 0 1.5.67 1.5 1.5 0 .83-.67 1.5-1.5 1.5zm7 0c-.83 0-1.5-.67-1.5-1.5 0-.83.67-1.5 1.5-1.5.83 0 1.5.67 1.5 1.5 0 .83-.67 1.5-1.5 1.5z"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-message">${message}</span>
    `;

    this._toastContainer.appendChild(toast);

    // Trigger transition Reflow
    setTimeout(() => toast.classList.add("show"), 10);

    // Auto delete toast after 3 seconds
    setTimeout(() => {
      toast.classList.remove("show");
      toast.addEventListener("transitionend", () => {
        toast.remove();
      });
    }, 3000);
  }

  /**
   * Display the slide-up suggestions bottom sheet
   * @param {object} options
   * @param {string} options.title - Header word clicked
   * @param {string} options.subtitle - Underline status (wrong ejaan / tidak baku)
   * @param {Array} options.suggestions - Suggestion replacements
   * @param {function} options.onSelect - Callback selected replacement word
   * @param {function} options.onReplaceAll - Callback replace all instances
   */
  showBottomSheet(options = {}) {
    if (!this._bottomSheet) return;

    const titleEl = this._bottomSheet.querySelector(".bottom-sheet-title");
    const subtitleEl = this._bottomSheet.querySelector(".bottom-sheet-subtitle");
    const contentEl = this._bottomSheet.querySelector(".bottom-sheet-content");

    if (titleEl) titleEl.textContent = `Kata: "${options.title}" (mew~)`;
    if (subtitleEl) subtitleEl.textContent = options.subtitle || "";

    // Build suggestions list UI
    contentEl.innerHTML = "";
    if (options.suggestions && options.suggestions.length > 0) {
      const list = document.createElement("div");
      list.className = "suggestion-list";
      list.style.display = "flex";
      list.style.flexWrap = "wrap";
      list.style.gap = "8px";
      list.style.marginBottom = "8px";

      options.suggestions.forEach((word) => {
        const item = document.createElement("button");
        item.className = "suggestion-pill";
        item.style.padding = "8px 16px";
        item.style.background = "var(--bg-tertiary)";
        item.style.border = "1px solid var(--accent-soft)";
        item.style.borderRadius = "20px";
        item.style.color = "var(--text-primary)";
        item.style.fontWeight = "700";
        item.style.fontSize = "0.95rem";
        item.style.cursor = "pointer";
        item.style.transition = "all 0.2s ease";

        item.textContent = word;

        item.addEventListener("click", () => {
          if (options.onSelect) options.onSelect(word);
          this.hideBottomSheet();
        });

        list.appendChild(item);
      });

      // Add "Ganti Semua" option button
      const replaceAllBtn = document.createElement("button");
      replaceAllBtn.className = "capsule-btn capsule-btn-outline";
      replaceAllBtn.style.marginTop = "12px";
      replaceAllBtn.style.width = "100%";
      replaceAllBtn.innerHTML = `
        <svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
        Ganti Semua Kata Serupa
      `;
      replaceAllBtn.addEventListener("click", () => {
        if (options.onReplaceAll && options.suggestions.length > 0) {
          options.onReplaceAll(options.suggestions[0]);
        }
        this.hideBottomSheet();
      });
      list.appendChild(replaceAllBtn);

      contentEl.appendChild(list);
    } else {
      contentEl.innerHTML = `
        <div style="text-align:center;padding:20px;color:var(--text-secondary);">
          <p>Tidak ditemukan saran kata terdekat di KBBI. meow~</p>
          <p style="font-size:0.8rem;margin-top:4px;">Coba ketik kata dasar dari kata tersebut ya, biar kucingmu ikut bantu.</p>
        </div>
      `;
    }

    // Toggle states classes
    this._bottomSheetOverlay.classList.add("active");
    this._bottomSheet.classList.add("active");
  }

  hideBottomSheet() {
    if (!this._bottomSheet) return;
    this._bottomSheetOverlay.classList.remove("active");
    this._bottomSheet.classList.remove("active");
  }

  /* --- Settings Sidebar handlers --- */

  showSettings() {
    if (!this._settingsPanel) return;
    this._settingsOverlay.classList.add("active");
    this._settingsPanel.classList.add("active");
  }

  hideSettings() {
    if (!this._settingsPanel) return;
    this._settingsOverlay.classList.remove("active");
    this._settingsPanel.classList.remove("active");
  }

  /* --- Active View Switching (Tab routing) --- */

  /**
   * Switch the active single-page view
   * @param {string} viewId - ID of active view section ('tulis' | 'sketsa' | 'draft')
   */
  switchTab(viewId) {
    // 1. Deactivate all navigation tab buttons
    document.querySelectorAll(".tab-item").forEach((btn) => {
      btn.classList.remove("active");
      if (btn.dataset.tab === viewId) {
        btn.classList.add("active");
      }
    });

    // 2. Hide all view panels
    document.querySelectorAll(".view-panel").forEach((panel) => {
      panel.classList.remove("active");
    });

    // 3. Show the selected panel with animation
    const targetPanel = document.getElementById(`view-${viewId}`);
    if (targetPanel) {
      // Force reflow to restart animation
      void targetPanel.offsetWidth;
      targetPanel.classList.add("active");
    }
  }
}
