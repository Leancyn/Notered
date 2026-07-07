/**
 * kbbi-validator.js - KBBI Data Validator
 *
 * Validates and fixes KBBI definition formatting without changing content.
 * Follows strict rules to preserve all original information.
 * 
 * Rules:
 * 1. Don't delete any characters from definitions
 * 2. Don't remove meanings, examples, derivatives, definition numbers, or word classes
 * 3. If something looks broken, keep it as-is
 * 4. Don't conclude that something is unimportant
 * 5. Don't summarize definitions
 * 6. Don't rewrite definitions in own language
 * 7. If definition appears cut off, mark with [Kemungkinan data tidak lengkap]
 * 8. Convert HTML/HTML Entities to plain text only
 * 9. Preserve all KBBI information
 * 10. Output must have same number of meanings as input
 */

export class KbbiValidator {
  constructor() {
    // Word class abbreviation mapping (for reference only)
    this.wordClassMap = {
      'n': 'Nomina',
      'v': 'Verba',
      'a': 'Adjektiva',
      'adv': 'Adverbia',
      'pron': 'Pronomina',
      'num': 'Numeralia',
      'p': 'Partikel',
      'kp': 'Kata Penghubung',
    };
  }

  /**
   * Validate and fix KBBI definition text
   * @param {string} rawText - Raw KBBI definition text
   * @returns {object} Validation result with fixed text and status
   */
  validate(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return {
        success: false,
        error: 'Input tidak valid',
        fixedText: rawText,
        isIncomplete: false
      };
    }

    const originalText = rawText;
    let text = rawText;

    // Step 1: Check for HTML entities and tags
    const hasHtml = /<[^>]*>|&[a-zA-Z]+;|&#\d+;/.test(text);
    
    // Step 2: Decode HTML entities if present
    if (hasHtml) {
      text = this._decodeHtmlEntities(text);
    }

    // Step 3: Remove HTML tags but preserve content
    if (hasHtml) {
      text = this._removeHtmlTags(text);
    }

    // Step 4: Clean up spacing (minimal changes)
    text = this._cleanSpacing(text);

    // Step 5: Validate structure
    const validation = this._validateStructure(text, originalText);

    // Step 6: Check for completeness
    const completenessCheck = this._checkCompleteness(text);

    return {
      success: validation.isValid,
      fixedText: text,
      originalText: originalText,
      isIncomplete: completenessCheck.isIncomplete,
      warning: completenessCheck.warning,
      issues: validation.issues,
      definitionCount: validation.definitionCount,
      hasDerivatives: validation.hasDerivatives,
      hasTerms: validation.hasTerms
    };
  }

  /**
   * Decode HTML entities
   * @param {string} str
   * @returns {string}
   */
  _decodeHtmlEntities(str) {
    if (typeof document !== 'undefined' && document.createElement) {
      try {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
      } catch (e) {
        // Fall through to manual decoding
      }
    }
    
    // Manual HTML entity decoding (fallback for non-browser environments).
    // Patterns are built via string concatenation to avoid the source itself
    // being interpreted as HTML entities. Decode & LAST so already-decoded
    // entities are not re-processed.
    const e = '&';
    return str
      .replace(new RegExp(e + 'lt;', 'g'), '<')
      .replace(new RegExp(e + 'gt;', 'g'), '>')
      .replace(new RegExp(e + 'quot;', 'g'), '"')
      .replace(new RegExp(e + '#39;', 'g'), "'")
      .replace(new RegExp(e + 'nbsp;', 'g'), ' ')
      .replace(new RegExp(e + 'amp;', 'g'), '&');
  }

  /**
   * Remove HTML tags while preserving content
   * @param {string} str
   * @returns {string}
   */
  _removeHtmlTags(str) {
    return str.replace(/<[^>]*>/g, '');
  }

  /**
   * Clean up excessive spacing (minimal changes)
   * @param {string} str
   * @returns {string}
   */
  _cleanSpacing(str) {
    const lines = str.split('\n');
    
    const cleanedLines = lines.map(line => {
      // Replace multiple spaces/tabs with single space
      line = line.replace(/[ \t]+/g, ' ');
      
      // Clean up spacing around punctuation (minimal). Dots are left alone
      // because KBBI syllable markers can use them, e.g. "ti.dak".
      line = line.replace(/\s*([;:,])\s*/g, '$1 ');
      
      // Remove space before closing punctuation
      line = line.replace(/\s+([;:,.])(?=\s|$)/g, '$1');
      
      return line.trim();
    });
    
    return cleanedLines.join('\n');
  }

  /**
   * Validate structure of KBBI definition
   * @param {string} text - Cleaned text
   * @param {string} originalText - Original text for comparison
   * @returns {object} Validation result
   */
  _validateStructure(text, originalText) {
    const issues = [];
    const result = {
      isValid: true,
      issues: issues,
      definitionCount: 0,
      hasDerivatives: false,
      hasTerms: false
    };

    // KBBI meaning numbers belong to the MAIN definition block. The
    // "Istilah:" (terms) and "Turunan:" (derivatives) subsections carry
    // their own independent numbering, so they must be excluded from the
    // sequentiality check or they produce false "not in order" warnings.
    // Strip them from the source we extract numbers from.
    const stripSubsections = (src) =>
      src
        .replace(/Istilah:\s*[\s\S]*?(?=Turunan:|$)/i, ' ')
        .replace(/Turunan:\s*[\s\S]*$/i, ' ');

    // The most reliable signal is the raw source: each meaning number is
    // explicitly wrapped in <b>N</b>, while the headword is <b>word</b> and
    // homograph markers use <sup>N</sup>. This avoids matching years,
    // quantities, or the numbering inside Istilah/Turunan subsections.
    // Decode HTML entities first so <b> markers are visible even when the
    // source is entity-encoded (e.g. <b>1</b>). Fall back to the
    // cleaned text when no <b> markers are present.
    const rawDecoded = this._decodeHtmlEntities(
      (typeof originalText === 'string' && originalText.length) ? originalText : text
    );
    const source = rawDecoded.includes('<b>') ? rawDecoded : text;
    const mainText = stripSubsections(source);

    const definitions = [];
    if (mainText.includes('<b>')) {
      // The FIRST meaning number is often embedded in the headword tag,
      // e.g. "<b>agak 1</b>" or "<b><sup>1</sup>abu-abu 1</b>". Capture the
      // number that appears after the word text (the last digit before the
      // headword's closing </b>, ignoring any leading homograph digit).
      const headBold = mainText.match(/<b>[\s\S]*?<\/b>/);
      if (headBold) {
        const inner = headBold[0].replace(/<[^>]*>/g, '');
        const afterWord = inner.replace(/^\d+/, '');
        const lastNum = afterWord.match(/(\d+)(?![\d\D]*\d)/);
        if (lastNum) definitions.push(parseInt(lastNum[1], 10));
      }
      // Subsequent meaning numbers are wrapped in their own <b>N</b>.
      const boldNums = mainText.match(/<b>\s*(\d+)\s*<\/b>/g) || [];
      for (const token of boldNums) {
        const m = token.match(/(\d+)/);
        if (m) definitions.push(parseInt(m[1], 10));
      }
    }

    // Fallback heuristic (already-cleaned input): a meaning number is
    // preceded by "; " or by a word-class abbreviation. This still excludes
    // most content numbers (e.g. "500 g", "tahun 1901").
    if (definitions.length === 0) {
      const definitionPattern = /(?:;|\b(?:n|v|a|adv|adj|pron|num|p|kp)\b)\s+(\d+)/g;
      let match;
      while ((match = definitionPattern.exec(mainText)) !== null) {
        definitions.push(parseInt(match[1], 10));
      }
    }

    result.definitionCount = definitions.length;

    // Check sequentiality. KBBI legitimately restarts numbering for
    // homographs and nested sub-senses (e.g. "1 2 3 1 2 3"), so a number
    // LOWER than expected is treated as the start of a new block (no error).
    // Only a number HIGHER than expected signals a genuine gap (missing
    // meaning), which we report. Baseline "expected" on the first observed
    // number so a record that begins mid-sequence (e.g. a secondary
    // homograph) is not falsely flagged.
    let expected = definitions.length ? definitions[0] : 1;
    for (let i = 0; i < definitions.length; i++) {
      const n = definitions[i];
      if (n === expected) {
        expected++;
      } else if (n < expected) {
        // New sub-block / homograph: restart from here.
        expected = n + 1;
      } else {
        issues.push(`Nomor arti tidak berurutan: ditemukan ${n}, diharapkan ${expected}`);
        result.isValid = false;
        // Re-sync to avoid cascading false positives.
        expected = n + 1;
      }
    }

    // Check for "Turunan:" section
    if (/Turunan:/i.test(text)) {
      result.hasDerivatives = true;
    }

    // Check for "Istilah:" section
    if (/Istilah:/i.test(text)) {
      result.hasTerms = true;
    }

    return result;
  }

  /**
   * Check for completeness indicators
   * @param {string} text - Cleaned text
   * @returns {object} Completeness check result
   */
  _checkCompleteness(text) {
    const result = {
      isIncomplete: false,
      warning: null
    };

    const lines = text.split('\n');
    const lastLine = (lines[lines.length - 1] || '').trim();

    // A line that is ONLY a definition header with no content after the word class
    // e.g. "1 n " or "2 v" with nothing else => incomplete
    const headerOnlyPattern = /^\d+\s+[a-zA-Z]+\s*$/;
    if (headerOnlyPattern.test(lastLine)) {
      result.isIncomplete = true;
      result.warning = '[Kemungkinan data tidak lengkap]';
      return result;
    }

    // A definition number + word class immediately at the end of the text
    // (no content following it on that line)
    const emptyDefPattern = /(\d+)\s+[a-zA-Z]+\s*$/m;
    if (emptyDefPattern.test(text)) {
      result.isIncomplete = true;
      result.warning = '[Kemungkinan data tidak lengkap]';
      return result;
    }

    // Ends with a dangling word-class abbreviation and a space but no content
    if (/^\d+\s+[a-zA-Z]+\s+$/.test(lastLine)) {
      result.isIncomplete = true;
      result.warning = '[Kemungkinan data tidak lengkap]';
      return result;
    }

    return result;
  }

  /**
   * Quick validation - just check and fix basic formatting
   * @param {string} rawText - Raw KBBI definition text
   * @returns {string} Fixed text
   */
  fixFormatting(rawText) {
    const result = this.validate(rawText);
    return result.fixedText;
  }

  /**
   * Validate multiple definitions
   * @param {Array<string>} definitions - Array of definition texts
   * @returns {Array<object>} Array of validation results
   */
  validateBatch(definitions) {
    if (!Array.isArray(definitions)) {
      return [];
    }

    return definitions.map(def => this.validate(def));
  }

  /**
   * Check if text contains HTML
   * @param {string} text
   * @returns {boolean}
   */
  hasHtml(text) {
    return /<[^>]*>|&[a-zA-Z]+;|&#\d+;/.test(text);
  }

  /**
   * Extract definition count from text
   * @param {string} text
   * @returns {number}
   */
  countDefinitions(text) {
    if (!text || typeof text !== 'string') return 0;
    // Prefer meaning numbers wrapped in <b>N</b> from the raw source; the
    // Istilah/Turunan subsections carry their own numbering and are excluded.
    const mainText = text
      .replace(/Istilah:\s*[\s\S]*?(?=Turunan:|$)/i, ' ')
      .replace(/Turunan:\s*[\s\S]*$/i, ' ');
    if (mainText.includes('<b>')) {
      const matches = mainText.match(/<b>\s*\d+\s*<\/b>/g);
      return matches ? matches.length : 0;
    }
    // Fallback: numbers preceded by "; " or a word-class abbreviation.
    const definitionPattern = /(?:;|\b(?:n|v|a|adv|adj|pron|num|p|kp)\b)\s+(\d+)/g;
    const matches = mainText.match(definitionPattern);
    return matches ? matches.length : 0;
  }

  /**
   * Extract derivatives from text
   * @param {string} text
   * @returns {Array<string>}
   */
  extractDerivatives(text) {
    const derivatives = [];
    const turunanMatch = text.match(/Turunan:\s*([\s\S]*?)(?=Istilah:|$)/i);
    
    if (turunanMatch) {
      const turunanText = turunanMatch[1];
      const lines = turunanText.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        const cleaned = line.replace(/^[•\-\s]+/, '').trim();
        if (cleaned) {
          derivatives.push(cleaned);
        }
      });
    }

    return derivatives;
  }

  /**
   * Extract terms (Istilah) from text
   * @param {string} text
   * @returns {Array<string>}
   */
  extractTerms(text) {
    const terms = [];
    const istilahMatch = text.match(/Istilah:\s*([\s\S]*?)(?=Turunan:|$)/i);
    
    if (istilahMatch) {
      const istilahText = istilahMatch[1];
      const lines = istilahText.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        const cleaned = line.replace(/^[•\-\s]+/, '').trim();
        if (cleaned) {
          terms.push(cleaned);
        }
      });
    }

    return terms;
  }
}

// Export singleton instance
export const kbbiValidator = new KbbiValidator();
