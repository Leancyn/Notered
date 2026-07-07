/**
 * editor.js — Text Editor Module for Notered
 *
 * Core design principles:
 * ─────────────────────────────────────────────
 * 1. NEVER mutate innerHTML during active typing (300ms debounce).
 * 2. Auto-correct operates on the TEXT NODE directly (no innerHTML rebuild).
 * 3. Spell-check rendering uses a "mark" pass — only annotates words that
 *    changed since last pass (reduces DOM thrash on large documents).
 * 4. Cursor is saved/restored using absolute character offsets measured
 *    from the root of the editor element.
 * 5. The "auto-enter bug" is fixed by:
 *    - NOT intercepting Enter in keydown at all (it inserts <br> naturally).
 *    - Auto-correct fires on Space/punctuation via "input" event AFTER the
 *      character is inserted, then corrects the PREVIOUS word in the text
 *      node — no spurious Enter is generated.
 *
 * Bug fixes vs previous version:
 * - Removed _autoCorrectTimer that was calling _processText() every 300ms
 *   during typing (caused cursor jump and double-enter).
 * - Auto-correct now patches the previous word in the text node directly
 *   instead of rebuilding the entire innerHTML.
 * - _processText() is debounced to 800ms after the LAST keystroke only.
 * - Replaced execCommand('insertText') in paste handler with
 *   insertText(DataTransfer) modern API with execCommand fallback.
 * - Fixed blank-line <br> over-counting that desynced caret offset.
 * - Guarded IME composition so mid-composition DOM rebuilds can't jump caret.
 */

import { SpellChecker } from './spellcheck.js';
import { Storage }       from './storage.js';
import { normalizeForSpellcheck } from './puebi-normalize.js';

// ── Word boundary regex (compiled once) ────────────────────────────────────
const RE_WORD_TOKEN   = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'-]*[\p{L}\p{N}]|[\p{L}\p{N}])([^\p{L}\p{N}]*)$/u;
const RE_WHITESPACE   = /^\s+$/;
const RE_IS_SEPARATOR = /[\s.,!?;:]/; // characters that end a word

export class Editor {
  /**
   * @param {HTMLElement} editorEl — The contenteditable element
   * @param {SpellChecker} spellChecker
   * @param {object} callbacks
   * @param {function} callbacks.onStatsUpdate
   * @param {function} callbacks.onWordClick
   * @param {function} callbacks.onSave
   * @param {function} callbacks.onMascotUpdate
   */
  constructor(editorEl, spellChecker, callbacks = {}) {
    this.el           = editorEl;
    this.spellChecker = spellChecker;
    this.callbacks    = callbacks;

    this.autoCorrect     = true;
    this._debounceTimer  = null;
    this._autoSaveTimer  = null;
    this._isProcessing   = false;
    this._isComposing    = false; // true while an IME composition is active
    this._lastText       = '';
    this._spellResults   = new Map();

    this._init();
  }

  // ── Initialization ────────────────────────────────────────────────────────

  _init() {
    // ── Input: debounced spell-check, immediate stats, auto-correct on word end
    this.el.addEventListener('input', (e) => {
      this._onInput(e);
    });

    // ── Paste: strip formatting
    this.el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      // Use modern insertText if available, fall back to execCommand
      if (!document.execCommand('insertText', false, text)) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });

    // ── Click: show suggestion popup for error/warning words
    this.el.addEventListener('click', (e) => {
      const wordSpan = e.target.closest('.word-error, .word-warning');
      if (wordSpan) this._onWordClick(wordSpan, e);
    });

    // ── Keyboard: shortcuts only (no Enter interception — let browser handle it)
    this.el.addEventListener('keydown', (e) => {
      this._handleShortcuts(e);
    });

    // ── IME composition guard: mid-composition DOM mutations jump the caret on
    //    mobile, so we suspend auto-correct / rebuild while composing.
    this.el.addEventListener('compositionstart', () => { this._isComposing = true; });
    this.el.addEventListener('compositionend',   () => { this._isComposing = false; });

    // ── Make Enter insert <br> instead of <div>/<p> so the plain-text model
    //    (and therefore caret offsets) stays consistent across rebuilds.
    try { document.execCommand('defaultParagraphSeparator', false, 'br'); } catch (_) {}

    // ── Focus/blur
    this.el.addEventListener('focus', () => this.el.classList.add('editor-focused'));
    this.el.addEventListener('blur', () => {
      this.el.classList.remove('editor-focused');
      // Force one final spell-check pass when leaving the editor
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._processText(), 0);
    });

    this._startAutoSave();
  }

  // ── Input Handler ─────────────────────────────────────────────────────────

  _onInput(e) {
    // 1. Immediate stats update (cheap, no DOM modification)
    this._updateStatsQuick();

    // 2. Skip auto-correct / rebuild while an IME composition is active.
    //    Mutating the DOM mid-composition causes the caret to jump.
    if (this._isComposing || (e && e.isComposing)) return;

    // 3. Auto-correct: check if the character that just fired "input" is a
    //    word-separator (space, punctuation). If so, correct the PREVIOUS word
    //    directly in the text node — no innerHTML rebuild needed.
    if (this.autoCorrect) {
      // inputType='insertText' and data is the character inserted
      const insertedChar = (e && (e.inputType === 'insertText' || e.inputType === 'insertCompositionText'))
        ? (e.data ?? '')
        : '';
      if (insertedChar && RE_IS_SEPARATOR.test(insertedChar)) {
        this._autoCorrectPreviousWord();
      }
    }

    // 4. Debounced full spell-check rebuild (800ms after last keystroke)
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._processText();
    }, 800);
  }

  // ── Auto-correct: previous word in text node ──────────────────────────────
  /**
   * When the user types a separator character (space, punctuation), we look
   * at the text node before the cursor, extract the last word, and if there
   * is a single unambiguous correction, replace it in-place.
   *
   * This NEVER triggers a full innerHTML rebuild, so it cannot cause
   * cursor jumps or accidental newlines.
   */
  _autoCorrectPreviousWord() {
    if (!this.spellChecker) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const node  = range.startContainer;

    // Must be inside a text node (or span's text child)
    const textNode = node.nodeType === Node.TEXT_NODE ? node
      : node.firstChild?.nodeType === Node.TEXT_NODE ? node.firstChild
      : null;
    if (!textNode) return;

    const text      = textNode.textContent;
    const cursorPos = (node === textNode) ? range.startOffset : textNode.length;

    // Walk backwards from cursor to find the start of the previous word.
    // The separator was just inserted AT cursorPos-1, so the word ends at cursorPos-2.
    let wordEnd = cursorPos - 1; // position of separator character
    // Skip any leading separators
    while (wordEnd > 0 && RE_IS_SEPARATOR.test(text[wordEnd - 1])) wordEnd--;

    if (wordEnd <= 0) return;

    let wordStart = wordEnd;
    while (wordStart > 0 && !RE_IS_SEPARATOR.test(text[wordStart - 1])) {
      wordStart--;
    }

    const word = text.substring(wordStart, wordEnd);
    if (!word || word.length < 2) return;

    // Only correct pure alpha words (avoid numbers, hyphens, etc.)
    if (!/^[\p{L}]+$/u.test(word)) return;

    const result = this.spellChecker.check(word);

    // Auto-correct condition: single unambiguous suggestion
    if ((result.type === 'error' || result.type === 'tidak_baku')
        && result.suggestions.length === 1) {
      const corrected = result.suggestions[0];
      if (corrected === word.toLowerCase()) return; // already correct (case diff)

      const before   = text.substring(0, wordStart);
      const after    = text.substring(wordEnd);
      const newText  = before + corrected + after;

      // Patch text node in-place — no DOM structure change
      textNode.textContent = newText;

      // Restore cursor after the corrected word + separator
      const newCursorPos = wordStart + corrected.length + (cursorPos - wordEnd);
      const newRange = document.createRange();
      newRange.setStart(textNode, Math.min(newCursorPos, newText.length));
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      // Clear result cache for corrected word so next pass uses updated text
      if (this.spellChecker.clearCache) this.spellChecker.clearCache();
    }
  }

  // ── Quick Stats ───────────────────────────────────────────────────────────

  _updateStatsQuick() {
    const text  = this.getPlainText();
    const words = text.trim() === '' ? [] : text.trim().split(/\s+/);
    if (this.callbacks.onStatsUpdate) {
      this.callbacks.onStatsUpdate({
        words         : words.length,
        chars         : text.length,
        charsNoSpace  : text.replace(/\s/g, '').length,
        sentences     : (text.match(/[.!?]+/g) || []).length || (text.length > 0 ? 1 : 0),
        paragraphs    : text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || (text.length > 0 ? 1 : 0),
        correctWords  : 0,
        errorWords    : 0,
        warningWords  : 0,
        accuracy      : 100,
        readTime      : Math.ceil(words.length / 200) > 0
          ? Math.ceil(words.length / 200) + ' menit'
          : '< 1 menit',
      });
    }
  }

  // ── Full Spell-check Pass ─────────────────────────────────────────────────

  async _processText() {
    if (this._isProcessing) return;
    // Never rebuild the DOM mid IME composition — it would make the caret jump.
    if (this._isComposing) return;
    this._isProcessing = true;

    try {
      const rawText        = this.getPlainText();
      const normalizedText = normalizeForSpellcheck(rawText);

      // Skip if content hasn't changed since last pass
      if (normalizedText === this._lastText) return;
      this._lastText = normalizedText;

      // Tokenize and generate annotated HTML
      const { html, stats } = this._buildAnnotatedHtml(normalizedText);

      // Only update DOM if HTML actually changed (avoids redundant reflow)
      if (html !== this.el.innerHTML) {
        const savedSel = this._saveSelection();
        this.el.innerHTML = html;
        this._restoreSelection(savedSel);
      }

      // Update stats
      if (this.callbacks.onStatsUpdate) {
        this.callbacks.onStatsUpdate(stats);
      }

      // Update mascot
      if (this.callbacks.onMascotUpdate) {
        if (stats.errorWords === 0 && stats.words > 0) {
          this.callbacks.onMascotUpdate('happy');
        } else if (stats.errorWords > 5) {
          this.callbacks.onMascotUpdate('worried');
        } else {
          this.callbacks.onMascotUpdate('neutral');
        }
      }
    } catch (err) {
      console.error('Editor _processText error:', err);
    } finally {
      this._isProcessing = false;
    }
  }

  // ── HTML Annotation Builder ───────────────────────────────────────────────

  _buildAnnotatedHtml(text) {
    const lines = text.split('\n');
    let html = '';
    let totalChecked = 0;
    let correctCount = 0;
    let errorCount   = 0;
    let warningCount = 0;

    for (let li = 0; li < lines.length; li++) {
      if (li > 0) html += '<br>';
      const line = lines[li];

      if (line.trim() === '') {
        // Blank line: the joining <br> added above already represents the
        // newline. Adding another <br> here would desync the caret offset
        // (saved plain-text counts 1 newline, rebuilt HTML would have 2).
        continue;
      }

      const tokens = line.split(/(\s+)/);
      for (const token of tokens) {
        if (RE_WHITESPACE.test(token)) {
          html += token;
          continue;
        }
        if (token === '') continue;

        const m = token.match(RE_WORD_TOKEN);
        if (!m) {
          html += this._escHtml(token);
          continue;
        }

        const [, before, word, after] = m;
        const result = this.spellChecker.check(word);
        this._spellResults.set(word.toLowerCase(), result);

        if (result.type !== 'ignored') {
          totalChecked++;
          if (result.type === 'correct' || result.type === 'whitelisted') correctCount++;
          else if (result.type === 'error')       errorCount++;
          else if (result.type === 'tidak_baku')  warningCount++;
        }

        html += this._escHtml(before);

        if (result.type === 'error') {
          html += `<span class="word-error" data-word="${this._escAttr(word)}" data-suggestions='${JSON.stringify(result.suggestions)}' title="Kata tidak ditemukan di KBBI">${this._escHtml(word)}</span>`;
        } else if (result.type === 'tidak_baku') {
          html += `<span class="word-warning" data-word="${this._escAttr(word)}" data-baku="${this._escAttr(result.bakuForm || '')}" data-suggestions='${JSON.stringify(result.suggestions)}' title="Kata tidak baku — gunakan: ${result.bakuForm}">${this._escHtml(word)}</span>`;
        } else {
          html += this._escHtml(word);
        }

        html += this._escHtml(after);
      }
    }

    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const accuracy  = totalChecked > 0 ? Math.round((correctCount / totalChecked) * 100) : 100;

    const stats = {
      words        : wordCount,
      chars        : text.length,
      charsNoSpace : text.replace(/\s/g, '').length,
      sentences    : (text.match(/[.!?]+/g) || []).length || (text.length > 0 ? 1 : 0),
      paragraphs   : text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || (text.length > 0 ? 1 : 0),
      correctWords : correctCount,
      errorWords   : errorCount,
      warningWords : warningCount,
      accuracy,
      readTime     : Math.ceil(wordCount / 200) > 0
        ? Math.ceil(wordCount / 200) + ' menit'
        : '< 1 menit',
    };

    return { html, stats };
  }

  // ── Word Click (Suggestion Popup) ─────────────────────────────────────────

  _onWordClick(wordSpan, event) {
    const word        = wordSpan.dataset.word;
    const suggestions = JSON.parse(wordSpan.dataset.suggestions || '[]');
    const bakuForm    = wordSpan.dataset.baku || null;
    const type        = wordSpan.classList.contains('word-error') ? 'error' : 'tidak_baku';
    const rect        = wordSpan.getBoundingClientRect();

    this._lastClickedSpan = wordSpan;

    if (this.callbacks.onWordClick) {
      this.callbacks.onWordClick({
        word, type, suggestions, bakuForm, rect,
        element   : wordSpan,
        replaceWith: (newWord) => this._replaceWord(wordSpan, newWord),
        replaceAll : (oldWord, newWord) => this._replaceAllWords(oldWord, newWord),
      });
    }
  }

  _replaceWord(wordSpan, newWord) {
    const textNode = document.createTextNode(newWord);
    wordSpan.replaceWith(textNode);

    // Place cursor after the new text
    try {
      const sel   = window.getSelection();
      const range = document.createRange();
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}

    this._lastText = '';
    this._updateStatsQuick();

    // Schedule re-check
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._processText(), 600);
  }

  _replaceAllWords(oldWord, newWord) {
    this.el.querySelectorAll(`[data-word="${oldWord}"]`).forEach(span => {
      span.replaceWith(document.createTextNode(newWord));
    });
    this._lastText = '';
    this._updateStatsQuick();

    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._processText(), 600);
  }

  // ── Cursor Save / Restore ─────────────────────────────────────────────────

  /**
   * Compute absolute character offset of the current cursor position
   * within the editor's plain-text content.
   */
  _saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    if (!this.el.contains(range.startContainer)) return null;

    const preRange = document.createRange();
    preRange.selectNodeContents(this.el);
    preRange.setEnd(range.startContainer, range.startOffset);

    const clone = preRange.cloneContents();
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('div, p').forEach(el => el.before('\n'));
    return { offset: clone.textContent.length };
  }

  _restoreSelection(saved) {
    if (!saved) return;

    const sel = window.getSelection();
    if (!sel) return;

    try {
      let remaining = saved.offset;
      const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
      let node = walker.nextNode();
      let lastNode = this.el;
      let lastOffset = 0;

      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (remaining <= len) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          remaining -= len;
          lastNode = node;
          lastOffset = len;
        } else if (node.nodeName === 'BR') {
          if (remaining === 0) {
            const range = document.createRange();
            range.setStartBefore(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          remaining -= 1;
          lastNode = node.parentNode;
          lastOffset = Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1;
        } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
          // Block elements consume one newline character (matches _saveSelection)
          if (remaining === 0) {
            const range = document.createRange();
            range.setStartBefore(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          remaining -= 1;
          lastNode = node.parentNode;
          lastOffset = Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1;
        }
        node = walker.nextNode();
      }

      // Fallback: end of editor
      if (document.activeElement === this.el) {
        const range = document.createRange();
        if (lastNode.nodeType === Node.TEXT_NODE) {
          range.setStart(lastNode, lastOffset);
        } else {
          range.selectNodeContents(this.el);
        }
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_) {}
  }

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────

  _handleShortcuts(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this._saveDraft();
      if (this.callbacks.onSave) this.callbacks.onSave();
    }
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────

  _startAutoSave() {
    this._autoSaveTimer = setInterval(() => this._saveDraft(), 5000);
  }

  _saveDraft() {
    const text = this.getPlainText();
    if (text.trim().length === 0) return;

    let draftId   = Storage.getActiveDraftId();
    const wc      = text.split(/\s+/).filter(w => w.length > 0).length;
    const title   = this._generateTitle(text);

    if (!draftId) {
      draftId = Storage.generateId();
      Storage.setActiveDraftId(draftId);
    }

    Storage.saveDraft({
      id         : draftId,
      title,
      content    : text,
      htmlContent: this.el.innerHTML,
      wordCount  : wc,
      updatedAt  : Date.now(),
      createdAt  : Storage.loadDraft(draftId)?.createdAt || Date.now(),
    });
  }

  _generateTitle(text) {
    const firstLine = text.split('\n').find(l => l.trim().length > 0) || '';
    return firstLine.trim().substring(0, 50) || 'Draft Tanpa Judul';
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get editor content as plain text (strips all HTML) */
  getPlainText() {
    const clone = this.el.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('div, p').forEach(el => el.before('\n'));
    return clone.textContent.replace(/^\n/, '') || '';
  }

  /** Set plain text content */
  setContent(text) {
    this.el.textContent = text;
    this._lastText = '';
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._processText(), 200);
  }

  /** Set HTML content (from a saved draft) */
  setHtmlContent(html) {
    this.el.innerHTML = html;
    this._lastText = '';
  }

  /** Clear all content */
  clear() {
    this.el.innerHTML = '';
    this._lastText = '';
    this._spellResults.clear();
    if (this.callbacks.onStatsUpdate) {
      this.callbacks.onStatsUpdate({
        words: 0, chars: 0, charsNoSpace: 0,
        sentences: 0, paragraphs: 0,
        correctWords: 0, errorWords: 0, warningWords: 0,
        accuracy: 100, readTime: '< 1 menit',
      });
    }
    if (this.callbacks.onMascotUpdate) this.callbacks.onMascotUpdate('neutral');
  }

  focus()           { this.el.focus(); }
  getSpellResults() { return this._spellResults; }

  recheckAll() {
    this._lastText = '';
    return this._processText();
  }

  setAutoCorrect(enabled) {
    this.autoCorrect = enabled;
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    clearInterval(this._autoSaveTimer);
  }

  // ── Escape Helpers ────────────────────────────────────────────────────────

  _escHtml(str) {
    const AMP = '&' + 'amp;', LT = '&' + 'lt;', GT = '&' + 'gt;', QUOT = '&' + 'quot;';
    return String(str)
      .replace(/&/g, AMP)
      .replace(/</g, LT)
      .replace(/>/g, GT)
      .replace(/"/g, QUOT);
  }

  _escAttr(str) {
    const QUOT = '&' + 'quot;', HASH39 = '&' + '#39;';
    return String(str)
      .replace(/"/g, QUOT)
      .replace(/'/g, HASH39);
  }
}