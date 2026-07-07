/**
 * storage.js - LocalStorage Persistence Manager
 * 
 * Handles draft autosaves, metadata retrieval, multiple draft lists,
 * and user settings (font sizes, theme preferences, API keys).
 */

const PREFIX_DRAFT = 'notered_draft_';
const KEY_ACTIVE_DRAFT = 'notered_active_draft_id';
const KEY_SETTINGS = 'notered_settings';
const MAX_DRAFTS = 10;

export class Storage {
  /**
   * Save a draft to LocalStorage
   * @param {object} draft - Draft data object
   * @param {string} draft.id - Draft UUID
   * @param {string} draft.title - Draft header text
   * @param {string} draft.content - Plain text contents
   * @param {string} draft.htmlContent - Formatted HTML contents
   * @param {number} draft.wordCount - Word count stat
   * @param {number} draft.updatedAt - Epoch time stamp
   */
  static saveDraft(draft) {
    if (!draft || !draft.id) return;
    
    // Auto purge older drafts to keep under MAX_DRAFTS
    const drafts = this.listDrafts();
    if (drafts.length >= MAX_DRAFTS && !drafts.find(d => d.id === draft.id)) {
      // Delete oldest draft (last element since sorted desc)
      const oldest = drafts[drafts.length - 1];
      this.deleteDraft(oldest.id);
    }

    localStorage.setItem(PREFIX_DRAFT + draft.id, JSON.stringify(draft));
  }

  /**
   * Retrieve a draft by ID
   * @param {string} id - Draft UUID
   * @returns {object|null}
   */
  static loadDraft(id) {
    if (!id) return null;
    const data = localStorage.getItem(PREFIX_DRAFT + id);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  /**
   * List all drafts sorted by updatedAt descending
   * @returns {Array} Draft metadata list
   */
  static listDrafts() {
    const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX_DRAFT)) {
        try {
          const draft = JSON.parse(localStorage.getItem(key));
          if (draft) drafts.push(draft);
        } catch (e) {
          // Skip corrupted entries
        }
      }
    }
    // Sort: newest first
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Delete a draft by ID
   * @param {string} id - Draft UUID
   */
  static deleteDraft(id) {
    if (!id) return;
    localStorage.removeItem(PREFIX_DRAFT + id);
    // If deleted active, clear active pointer
    if (this.getActiveDraftId() === id) {
      localStorage.removeItem(KEY_ACTIVE_DRAFT);
    }
  }

  /** Get active draft ID */
  static getActiveDraftId() {
    return localStorage.getItem(KEY_ACTIVE_DRAFT);
  }

  /** Set active draft ID */
  static setActiveDraftId(id) {
    if (id) {
      localStorage.setItem(KEY_ACTIVE_DRAFT, id);
    } else {
      localStorage.removeItem(KEY_ACTIVE_DRAFT);
    }
  }

  /**
   * Save user configuration
   * @param {object} settings
   */
  static saveSettings(settings) {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  }

  /**
   * Load user configuration with defaults
   * @returns {object} Settings payload
   */
  static loadSettings() {
    const data = localStorage.getItem(KEY_SETTINGS);
    const defaults = {
      fontSize: 16,
      apiKey: '',
      theme: 'light',
      autoCorrect: true
    };

    if (!data) return defaults;
    try {
      return { ...defaults, ...JSON.parse(data) };
    } catch (e) {
      return defaults;
    }
  }

  /** Create unique identifier string */
  static generateId() {
    return 'd_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }
}
