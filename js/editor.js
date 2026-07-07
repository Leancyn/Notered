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
    this._autoSaveTimer = null;
    this._isProcessing = false;
    this._lastText = "";
    this._spellResults = new Map(); // word -> check result

    // Cursor/DOM safety: contenteditable may represent Enter as <div>/<br>.
    // We skip one spellcheck rebuild after Enter to avoid double line breaks.
    this._skipNextProcessOnce = false;

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

    // Keyboard shortcuts and Autocorrect triggers
    // NOTE: We intentionally do NOT run autocorrect on Enter.
    // Autocorrect mutates DOM inside contenteditable and may cause the cursor
    // to jump / trigger extra line breaks on some browsers.
    this.el.addEventListener("keydown", (e) => {
      this._handleShortcuts(e);

      if (e.key === "Enter") {
        this._skipNextProcessOnce = true;
      }

      if (e.key === " ") {
        this._handleAutoCorrect(e);
      }
    });

    // Auto-save every 5 seconds
    this._startAutoSave();

    // Focus management
    this.el.addEventListener("focus", () => {
      this.el.classList.add("editor-focused");
    });
    this.el.addEventListener("blur", () => {
      this.el.classList.remove("editor-focused");
    });
  }

  /** Handle text input with debounced spell check */
  _onInput() {
    // If we just pressed Enter, skip one spellcheck rebuild cycle
    // to prevent Enter <div>/<br> roundtrips from creating extra lines.
    if (this._skipNextProcessOnce) {
      this._skipNextProcessOnce = false;
      // Still update stats immediately based on current plain text.
      this._updateStatsQuick();
      return;
    }

    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._processText();
    }, 400);

    // Update stats immediately (fast operation)
    this._updateStatsQuick();
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

      // Save cursor position BEFORE we mutate innerHTML.
      // Also disable selection saving for very short texts to avoid DOM reflow glitches.
      const savedSelection = this.getPlainText().length > 0 ? this._saveSelection() : null;

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

          if (result.type === "error") {
            html += `<span class="word-error" data-word="${this._escapeAttr(word)}" data-suggestions='${JSON.stringify(result.suggestions)}' title="Kata tidak ditemukan">${this._escapeHtml(word)}</span>`;
          } else if (result.type === "tidak_baku") {
            html += `<span class="word-warning" data-word="${this._escapeAttr(word)}" data-baku="${this._escapeAttr(result.bakuForm)}" data-suggestions='${JSON.stringify(result.suggestions)}' title="Kata tidak baku, gunakan: ${result.bakuForm}">${this._escapeHtml(word)}</span>`;
          } else {
            html += this._escapeHtml(word);
          }

          html += this._escapeHtml(after);
        }
      }

      // Update editor HTML
      this.el.innerHTML = html;

      // Restore cursor position
      this._restoreSelection(savedSelection);

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
    const textNode = document.createTextNode(newWord);
    wordSpan.replaceWith(textNode);

    // Re-process to update highlights
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._lastText = ""; // Force reprocess
      this._processText();
    }, 100);
  }

  /** Replace all instances of a word */
  _replaceAllWords(oldWord, newWord) {
    const spans = this.el.querySelectorAll(`[data-word="${oldWord}"]`);
    spans.forEach((span) => {
      const textNode = document.createTextNode(newWord);
      span.replaceWith(textNode);
    });

    // Re-process
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._lastText = "";
      this._processText();
    }, 100);
  }

  /** Save cursor position relative to text content */
  _saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(this.el);
    preRange.setEnd(range.startContainer, range.startOffset);
    const offset = preRange.toString().length;

    return { offset, length: range.toString().length };
  }

  /** Restore cursor position from saved offset */
  _restoreSelection(saved) {
    if (!saved) return;

    const sel = window.getSelection();
    if (!sel) return;

    let charCount = 0;
    let startNode = null,
      startOffset = 0;
    let endNode = null,
      endOffset = 0;
    const targetStart = saved.offset;
    const targetEnd = saved.offset + saved.length;

    const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT, null, false);

    let node;
    while ((node = walker.nextNode())) {
      const nodeLen = node.textContent.length;

      if (!startNode && charCount + nodeLen >= targetStart) {
        startNode = node;
        startOffset = targetStart - charCount;
      }
      if (!endNode && charCount + nodeLen >= targetEnd) {
        endNode = node;
        endOffset = targetEnd - charCount;
        break;
      }
      charCount += nodeLen;
    }

    if (startNode) {
      try {
        const range = document.createRange();
        range.setStart(startNode, Math.min(startOffset, startNode.textContent.length));
        range.setEnd(endNode || startNode, Math.min(endOffset || startOffset, (endNode || startNode).textContent.length));
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {
        // Silently fail cursor restoration
      }
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
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** Enable/disable autocorrect option */
  setAutoCorrect(enabled) {
    this.autoCorrect = enabled;
  }

  /** Autocorrect key handler */
  _handleAutoCorrect(e) {
    if (!this.autoCorrect) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    // We only autocorrect if we are typing inside a text node
    if (container.nodeType !== Node.TEXT_NODE) return;

    // Cursor safety under PUEBI: normalize the slice we analyze,
    // but DO NOT mutate DOM here (autocorrect already mutates only the word).
    const text = container.textContent;
    const textBeforeCursor = text.substring(0, offset);

    const normalizedBeforeCursor = normalizeForSpellcheck(textBeforeCursor);

    // Grab the last word typed right before cursor (from normalized slice)
    const match = normalizedBeforeCursor.match(/([\p{L}\p{N}'-]+)$/u);
    if (!match) return;

    const lastWord = match[1];
    if (lastWord.length < 3) return; // Too short for correction triggers

    // Perform check
    const checkResult = this.spellChecker.check(lastWord);
    if (checkResult.valid) return;

    let correction = null;
    if (checkResult.type === "tidak_baku" && checkResult.bakuForm) {
      correction = checkResult.bakuForm;
    } else if (checkResult.type === "error" && checkResult.suggestions && checkResult.suggestions.length > 0) {
      // Auto-correct spelling errors ONLY if the best suggestion is very close.
      // Use Damerau-Levenshtein to better handle transposition typos.
      const bestSuggestion = checkResult.suggestions[0];
      const dist = this.spellChecker.damerauDistance(lastWord.toLowerCase(), bestSuggestion);
      if (dist <= 1) {
        correction = bestSuggestion;
      }
    }

    if (correction) {
      // Find start offset of this word in the original (unnormalized) node.
      // We recompute using normalized slice length, then map back approximately.
      // Since normalizeForSpellcheck only adjusts whitespace around punctuation,
      // and autocorrect triggers on space, this mapping remains stable.
      const wordStartOffset = offset - lastWord.length;

      // Select the word to replace
      const replaceRange = document.createRange();
      replaceRange.setStart(container, wordStartOffset);
      replaceRange.setEnd(container, offset);

      // Replace content
      replaceRange.deleteContents();
      const newTextNode = document.createTextNode(correction);
      replaceRange.insertNode(newTextNode);

      // Keep cursor positioned after the corrected word
      range.setStartAfter(newTextNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}
