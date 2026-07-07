/**
 * editor.js - Text Editor Module for Notered
 *
 * Manages the contenteditable text area with real-time spell checking,
 * word-by-word highlighting, and suggestion popup interaction.
 */

import { SpellChecker } from "./spellcheck.js";
import { Stats } from "./stats.js";
import { Storage } from "./storage.js";
import { normalizeForSpellcheck } from "./puebi-normalize.js";

export class Editor {
  /**
   * @param {HTMLElement} editorEl - The contenteditable element
   * @param {SpellChecker} spellChecker - SpellChecker instance
   * @param {object} callbacks - Event callbacks
   * @param {function} callbacks.onStatsUpdate - Called with stats object
   * @param {function} callbacks.onWordClick - Called when error/warning word is clicked
   * @param {function} callbacks.onSave - Called when draft is auto-saved
   * @param {function} callbacks.onMascotUpdate - Called with mascot mood
   */
  constructor(editorEl, spellChecker, callbacks = {}) {
    this.el = editorEl;
    this.spellChecker = spellChecker;
    this.callbacks = callbacks;

    this.autoCorrect = true;
    this._debounceTimer = null;
    this._rebuildTimer = null;
    this._autoSaveTimer = null;
    this._autoCorrectTimer = null;
    this._isProcessing = false;
    this._lastText = "";
    this._needsRebuild = false;
    this._spellResults = new Map(); // word -> check result

    // Cursor/DOM safety: Enter is prevented in keydown to avoid double line breaks.
    // Spellcheck rebuild normalizes line breaks consistently.

    this._init();
  }

  /** Initialize editor event listeners */
  _init() {
    // Input handling with debounced spell check
    this.el.addEventListener("input", () => {
      this._onInput();
    });

    // Handle paste - strip formatting
    this.el.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    // Click on words for suggestions
    this.el.addEventListener("click", (e) => {
      const wordSpan = e.target.closest(".word-error, .word-warning");
      if (wordSpan) {
        this._onWordClick(wordSpan, e);
      }
    });

    // Keyboard shortcuts
    this.el.addEventListener("keydown", (e) => {
      this._handleShortcuts(e);
    });

    // Auto-save every 5 seconds
    this._startAutoSave();

    // Focus management
    this.el.addEventListener("focus", () => {
      this.el.classList.add("editor-focused");
    });

    // Rebuild spell check when user leaves the editor
    this.el.addEventListener("blur", () => {
      this.el.classList.remove("editor-focused");
      // Only rebuild if needed and not already processing
      if (this._needsRebuild && !this._isProcessing) {
        this._processText();
        this._needsRebuild = false;
      }
    });
  }

  /** Handle text input with debounced spell check */
  _onInput() {
    // Don't rebuild HTML during typing - this prevents cursor jumping
    // Just update stats immediately
    this._updateStatsQuick();

    // Mark that content has changed and needs rebuild later
    this._needsRebuild = true;

    // Auto-correct: trigger rebuild after a short delay to avoid interrupting typing
    if (this.autoCorrect) {
      clearTimeout(this._autoCorrectTimer);
      this._autoCorrectTimer = setTimeout(() => {
        this._processText();
        this._needsRebuild = false;
      }, 300); // Wait 300ms after user stops typing
    }
  }

  /** Quick stats update without full spell check */
  _updateStatsQuick() {
    const text = this.getPlainText();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (this.callbacks.onStatsUpdate) {
      this.callbacks.onStatsUpdate({
        words: words.length,
        chars: text.length,
        charsNoSpace: text.replace(/\s/g, "").length,
        sentences: (text.match(/[.!?]+/g) || []).length || (text.length > 0 ? 1 : 0),
        paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || (text.length > 0 ? 1 : 0),
        correctWords: 0,
        errorWords: 0,
        warningWords: 0,
        accuracy: 100,
        readTime: Math.ceil(words.length / 200) > 0 ? Math.ceil(words.length / 200) + " menit" : "< 1 menit",
      });
    }
  }

  /** Process text: tokenize, spell check, and highlight */
  async _processText() {
    if (this._isProcessing) return;
    this._isProcessing = true;

    try {
      // Normalize text with lightweight PUEBI rules before tokenization/spellcheck.
      // Cursor safety: we compute spellcheck highlights from normalized text,
      // but we restore cursor using offsets against the editor's current text.
      const normalizedText = normalizeForSpellcheck(this.getPlainText());
      if (normalizedText === this._lastText) {
        this._isProcessing = false;
        return;
      }
      this._lastText = normalizedText;

      // Use normalized text for tokenization/highlights, but keep selection restoration stable.
      const text = normalizedText;

      // Tokenize and check each word
      const lines = text.split("\n");
      let html = "";
      let totalChecked = 0;
      let correctCount = 0;
      let errorCount = 0;
      let warningCount = 0;
      const results = [];

      for (let i = 0; i < lines.length; i++) {
        if (i > 0) html += "<br>";
        const line = lines[i];
        if (line.trim() === "") {
          html += "<br>";
          continue;
        }

        // Split line preserving whitespace
        const tokens = line.split(/(\s+)/);
        for (const token of tokens) {
          if (/^\s+$/.test(token)) {
            // Whitespace - preserve as-is
            html += token;
            continue;
          }
          if (token === "") continue;

          // Extract punctuation around word
          const match = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'-]*[\p{L}\p{N}]|[\p{L}\p{N}])([^\p{L}\p{N}]*)$/u);

          if (!match) {
            // Pure punctuation or special chars
            html += this._escapeHtml(token);
            continue;
          }

          const [, before, word, after] = match;
          const result = this.spellChecker.check(word);

          this._spellResults.set(word.toLowerCase(), result);

          // Count stats
          if (result.type !== "ignored") {
            totalChecked++;
            if (result.type === "correct" || result.type === "whitelisted") {
              correctCount++;
            } else if (result.type === "error") {
              errorCount++;
              results.push({ word, type: "error", suggestions: result.suggestions });
            } else if (result.type === "tidak_baku") {
              warningCount++;
              results.push({ word, type: "tidak_baku", suggestions: result.suggestions, bakuForm: result.bakuForm });
            }
          }

          html += this._escapeHtml(before);

          // Auto-correct: if enabled and word has a single high-confidence suggestion, use it
          let displayWord = word;
          if (this.autoCorrect && result.type === "error" && result.suggestions.length === 1) {
            // Auto-correct with single suggestion - actually change the word
            displayWord = result.suggestions[0];
          }

          if (result.type === "error") {
            html += `<span class="word-error" data-word="${this._escapeAttr(word)}" data-suggestions='${JSON.stringify(result.suggestions)}' title="Kata tidak ditemukan">${this._escapeHtml(displayWord)}</span>`;
          } else if (result.type === "tidak_baku") {
            html += `<span class="word-warning" data-word="${this._escapeAttr(word)}" data-baku="${this._escapeAttr(result.bakuForm)}" data-suggestions='${JSON.stringify(result.suggestions)}' title="Kata tidak baku, gunakan: ${result.bakuForm}">${this._escapeHtml(displayWord)}</span>`;
          } else {
            html += this._escapeHtml(displayWord);
          }

          html += this._escapeHtml(after);
        }
      }

      // Only update DOM and restore cursor if HTML actually changed
      if (html !== this.el.innerHTML) {
        // Save cursor position BEFORE we mutate innerHTML
        const savedSelection = this.getPlainText().length > 0 ? this._saveSelection() : null;
        this.el.innerHTML = html;
        // Restore cursor position only when DOM was actually modified
        this._restoreSelection(savedSelection);
      }

      // Update stats (use normalized text for PUEBI-consistent counts)
      const accuracy = totalChecked > 0 ? Math.round((correctCount / totalChecked) * 100) : 100;
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

      if (this.callbacks.onStatsUpdate) {
        this.callbacks.onStatsUpdate({
          words: wordCount,
          chars: text.length,
          charsNoSpace: text.replace(/\s/g, "").length,
          sentences: (text.match(/[.!?]+/g) || []).length || (text.length > 0 ? 1 : 0),
          paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || (text.length > 0 ? 1 : 0),
          correctWords: correctCount,
          errorWords: errorCount,
          warningWords: warningCount,
          accuracy: accuracy,
          readTime: Math.ceil(wordCount / 200) > 0 ? Math.ceil(wordCount / 200) + " menit" : "< 1 menit",
        });
      }

      // Update mascot mood
      if (this.callbacks.onMascotUpdate) {
        if (errorCount === 0 && wordCount > 0) {
          this.callbacks.onMascotUpdate("happy");
        } else if (errorCount > 5) {
          this.callbacks.onMascotUpdate("worried");
        } else {
          this.callbacks.onMascotUpdate("neutral");
        }
      }
    } catch (err) {
      console.error("Editor processText error:", err);
    } finally {
      this._isProcessing = false;
    }
  }

  /** Handle click on error/warning word */
  _onWordClick(wordSpan, event) {
    const word = wordSpan.dataset.word;
    const suggestions = JSON.parse(wordSpan.dataset.suggestions || "[]");
    const bakuForm = wordSpan.dataset.baku || null;
    const type = wordSpan.classList.contains("word-error") ? "error" : "tidak_baku";

    const rect = wordSpan.getBoundingClientRect();

    // Store reference to clicked span for cursor tracking
    this._lastClickedSpan = wordSpan;

    if (this.callbacks.onWordClick) {
      this.callbacks.onWordClick({
        word,
        type,
        suggestions,
        bakuForm,
        rect,
        element: wordSpan,
        replaceWith: (newWord) => this._replaceWord(wordSpan, newWord),
        replaceAll: (oldWord, newWord) => this._replaceAllWords(oldWord, newWord),
      });
    }
  }

  /** Replace a single word span with new word */
  _replaceWord(wordSpan, newWord) {
    // Save cursor position before replacement
    const sel = window.getSelection();
    let cursorAfterWord = false;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Check if cursor is right after the word being replaced
      cursorAfterWord = range.startContainer === wordSpan || range.startContainer.parentNode === wordSpan;
    }

    const textNode = document.createTextNode(newWord);
    wordSpan.replaceWith(textNode);

    // If cursor was after this word, restore it right after the new text
    if (cursorAfterWord && textNode.parentNode) {
      try {
        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {
        // Silently fail
      }
    }

    // Don't immediately rebuild - just update stats and let debounce handle it
    // This prevents cursor jumping
    this._lastText = ""; // Force reprocess on next debounce
    this._updateStatsQuick();
  }

  /** Replace all instances of a word */
  _replaceAllWords(oldWord, newWord) {
    const spans = this.el.querySelectorAll(`[data-word="${oldWord}"]`);

    // Save cursor position before replacement
    const sel = window.getSelection();
    let cursorAfterWord = false;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const clickedSpan = this._lastClickedSpan;
      // Check if cursor is near the clicked word
      if ((clickedSpan && range.startContainer === clickedSpan) || range.startContainer.parentNode === clickedSpan) {
        cursorAfterWord = true;
      }
    }

    spans.forEach((span) => {
      const textNode = document.createTextNode(newWord);
      span.replaceWith(textNode);
    });

    // Don't immediately rebuild - just update stats and let debounce handle it
    // This prevents cursor jumping
    this._lastText = ""; // Force reprocess on next debounce
    this._updateStatsQuick();
  }

  /** Save cursor position using absolute character offset */
  _saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    
    // Calculate absolute character offset from start of editor
    const preRange = document.createRange();
    preRange.selectNodeContents(this.el);
    preRange.setEnd(textNode, range.startOffset);
    const absoluteOffset = preRange.toString().length;
    
    return {
      absoluteOffset: absoluteOffset
    };
  }

  /** Restore cursor position using absolute character offset */
  _restoreSelection(saved) {
    if (!saved || saved.absoluteOffset === undefined) return;

    const sel = window.getSelection();
    if (!sel) return;

    try {
      const targetOffset = saved.absoluteOffset;
      let currentOffset = 0;
      
      // Walk through all text nodes to find the correct position
      const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT, null, false);
      let node = walker.nextNode();
      
      while (node) {
        const nodeLength = node.textContent.length;
        
        if (currentOffset + nodeLength >= targetOffset) {
          // Found the text node containing the cursor
          const range = document.createRange();
          const cursorPos = targetOffset - currentOffset;
          
          range.setStart(node, Math.min(cursorPos, nodeLength));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
        
        currentOffset += nodeLength;
        node = walker.nextNode();
      }
      
      // Fallback: place cursor at end
      if (this.el.lastChild) {
        const range = document.createRange();
        range.selectNodeContents(this.el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (e) {
      // Silently fail
    }
  }

  /** Handle keyboard shortcuts */
  _handleShortcuts(e) {
    // Ctrl+S or Cmd+S - Save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      this._saveDraft();
      if (this.callbacks.onSave) {
        this.callbacks.onSave();
      }
    }
  }

  /** Start auto-save interval */
  _startAutoSave() {
    this._autoSaveTimer = setInterval(() => {
      this._saveDraft();
    }, 5000);
  }

  /** Save current content as draft */
  _saveDraft() {
    const text = this.getPlainText();
    if (text.trim().length === 0) return;

    let draftId = Storage.getActiveDraftId();
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    const title = this._generateTitle(text);

    if (!draftId) {
      draftId = Storage.generateId();
      Storage.setActiveDraftId(draftId);
    }

    Storage.saveDraft({
      id: draftId,
      title,
      content: text,
      htmlContent: this.el.innerHTML,
      wordCount,
      updatedAt: Date.now(),
      createdAt: Storage.loadDraft(draftId)?.createdAt || Date.now(),
    });
  }

  /** Generate draft title from first line */
  _generateTitle(text) {
    const firstLine = text.split("\n").find((l) => l.trim().length > 0) || "";
    const title = firstLine.trim().substring(0, 50);
    return title || "Draft Tanpa Judul";
  }

  /** Get plain text content (no HTML) */
  getPlainText() {
    // Clone to avoid modifying the actual editor
    const clone = this.el.cloneNode(true);
    // Replace <br> with newlines
    clone.querySelectorAll("br").forEach((br) => {
      br.replaceWith("\n");
    });
    // Replace block elements with newlines
    clone.querySelectorAll("div, p").forEach((el) => {
      el.before("\n");
    });
    return clone.textContent.replace(/^\n/, "") || "";
  }

  /** Set editor content */
  setContent(text) {
    this.el.textContent = text;
    this._lastText = "";
    // Trigger spell check
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._processText();
    }, 200);
  }

  /** Set editor HTML content (from saved draft) */
  setHtmlContent(html) {
    this.el.innerHTML = html;
    this._lastText = "";
  }

  /** Clear editor content */
  clear() {
    this.el.innerHTML = "";
    this._lastText = "";
    this._spellResults.clear();
    if (this.callbacks.onStatsUpdate) {
      this.callbacks.onStatsUpdate({
        words: 0,
        chars: 0,
        charsNoSpace: 0,
        sentences: 0,
        paragraphs: 0,
        correctWords: 0,
        errorWords: 0,
        warningWords: 0,
        accuracy: 100,
        readTime: "< 1 menit",
      });
    }
    if (this.callbacks.onMascotUpdate) {
      this.callbacks.onMascotUpdate("neutral");
    }
  }

  /** Focus the editor */
  focus() {
    this.el.focus();
  }

  /** Get current spell check results map */
  getSpellResults() {
    return this._spellResults;
  }

  /** Force re-check all text */
  recheckAll() {
    this._lastText = "";
    this._processText();
  }

  /** Destroy editor (cleanup timers) */
  destroy() {
    clearTimeout(this._debounceTimer);
    clearTimeout(this._rebuildTimer);
    clearTimeout(this._autoCorrectTimer);
    clearInterval(this._autoSaveTimer);
  }

  /** Escape HTML entities */
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /** Escape attribute value */
  _escapeAttr(str) {
    return str.replace(/"/g, '"').replace(/'/g, "&#39;");
  }

  /** Try to auto-correct the word at the current cursor position */
  _tryAutoCorrectAtCursor() {
    if (!this.spellChecker) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    // Only process text nodes
    if (textNode.nodeType !== Node.TEXT_NODE) return;

    const text = textNode.textContent;
    const cursorPos = range.startOffset;

    // Find the word at cursor (look backwards and forwards)
    let wordStart = cursorPos;
    while (wordStart > 0 && /[\p{L}\p{N}]/u.test(text[wordStart - 1])) {
      wordStart--;
    }

    let wordEnd = cursorPos;
    while (wordEnd < text.length && /[\p{L}\p{N}]/u.test(text[wordEnd])) {
      wordEnd++;
    }

    const word = text.substring(wordStart, wordEnd);
    if (!word || word.length < 2) return;

    // Check if word is misspelled
    const result = this.spellChecker.check(word);

    // Auto-correct if there's exactly one high-confidence suggestion
    if (result.type === "error" && result.suggestions.length === 1) {
      const corrected = result.suggestions[0];

      // Replace the word in the text node
      const before = text.substring(0, wordStart);
      const after = text.substring(wordEnd);
      textNode.textContent = before + corrected + after;

      // Move cursor to end of corrected word
      const newCursorPos = wordStart + corrected.length;
      const newRange = document.createRange();
      newRange.setStart(textNode, newCursorPos);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      // Force rebuild to update highlighting
      this._lastText = "";
      this._needsRebuild = true;

      // Update stats
      this._updateStatsQuick();
    }
  }

  /** Enable/disable autocorrect option */
  setAutoCorrect(enabled) {
    this.autoCorrect = enabled;
  }
}
