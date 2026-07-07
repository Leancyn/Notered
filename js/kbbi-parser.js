/**
 * kbbi-parser.js - KBBI Definition Parser and Formatter
 *
 * Parses raw KBBI definition text containing HTML entities and tags,
 * then formats it into clean, human-readable output.
 *
 * Rules:
 * - Preserve all original meaning and information
 * - Expand word class abbreviations (n → Nomina, v → Verba, etc.)
 * - Expand field of study abbreviations (Man → Manajemen, etc.)
 * - Remove HTML tags and entities
 * - Format numbered definitions
 * - Separate derivatives to new lines
 * - Clean up spacing
 */

export class KbbiParser {
  constructor() {
    // Word class abbreviation mapping
    this.wordClassMap = {
      'n': 'Nomina',
      'v': 'Verba',
      'a': 'Adjektiva',
      'adj': 'Adjektiva',
      'adv': 'Adverbia',
      'pron': 'Pronomina',
      'num': 'Numeralia',
      'p': 'Partikel',
      'kp': 'Kata Penghubung',
    };

    // Field of study abbreviation mapping
    this.fieldMap = {
      'Huk': 'Hukum',
      'Ling': 'Linguistik',
      'Kim': 'Kimia',
      'Bio': 'Biologi',
      'Geo': 'Geografi',
      'Dok': 'Kedokteran',
      'Man': 'Manajemen',
    };
  }

  /**
   * Parse raw KBBI definition text
   * @param {string} rawText - Raw definition text with HTML entities/tags
   * @returns {object} Parsed and formatted definition
   */
  parse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return null;
    }

    // Step 1: Decode HTML entities
    let text = this._decodeHtmlEntities(rawText);

    // Step 2: Remove HTML tags but preserve content
    text = this._removeHtmlTags(text);

    // Step 3: Clean up spacing
    text = this._cleanSpacing(text);

    // Step 4: Parse the structured content
    return this._parseStructuredContent(text);
  }

  /**
   * Decode HTML entities (e.g., < → <, > → >, & → &)
   * @param {string} str
   * @returns {string}
   */
  _decodeHtmlEntities(str) {
    // Use textarea trick if available (browser)
    if (typeof document !== 'undefined' && document.createElement) {
      try {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
      } catch (e) {
        // Fall through to manual decoding
      }
    }
    
    // Manual HTML entity decoding for Node.js or fallback.
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
   * Remove HTML tags while preserving their content
   * @param {string} str
   * @returns {string}
   */
  _removeHtmlTags(str) {
    // Remove all HTML tags
    return str.replace(/<[^>]*>/g, '');
  }

  /**
   * Clean up excessive spacing
   * @param {string} str
   * @returns {string}
   */
  _cleanSpacing(str) {
    // Split by lines to preserve line structure
    const lines = str.split('\n');
    
    // Clean each line individually
    const cleanedLines = lines.map(line => {
      // Replace multiple spaces/tabs with single space
      line = line.replace(/[ \t]+/g, ' ');
      
      // Clean up spacing around punctuation. Dots are left alone because
      // KBBI syllable markers can use them, e.g. "ti.dak".
      line = line.replace(/\s*([;:,])\s*/g, '$1 ');
      
      // Remove space before closing punctuation
      line = line.replace(/\s+([;:,.])(?=\s|$)/g, '$1');
      
      // Trim the line
      return line.trim();
    });
    
    // Join back with newlines
    return cleanedLines.join('\n');
  }

  /**
   * Expand word class abbreviation
   * @param {string} abbr
   * @returns {string}
   */
  _expandWordClass(abbr) {
    const trimmed = abbr.trim().toLowerCase();
    return this.wordClassMap[trimmed] || abbr;
  }

  _isWordClassToken(token) {
    const normalized = (token || '').trim().toLowerCase();
    return Boolean(this.wordClassMap[normalized]) || [
      'nomina',
      'verba',
      'adjektiva',
      'adverbia',
      'pronomina',
      'numeralia',
      'partikel',
      'kata kerja',
      'kata benda',
      'kata sifat',
      'kata keterangan',
    ].includes(normalized);
  }

  _normalizeWordClass(token) {
    const cleaned = (token || '').trim();
    if (!cleaned) return '';

    const expanded = this._expandWordClass(cleaned);
    if (expanded !== cleaned) return expanded;

    const lower = cleaned.toLowerCase();
    if (lower === 'kata kerja') return 'Verba';
    if (lower === 'kata benda') return 'Nomina';
    if (lower === 'kata sifat') return 'Adjektiva';
    if (lower === 'kata keterangan') return 'Adverbia';

    return cleaned.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  }

  /**
   * Expand field of study abbreviation
   * @param {string} abbr
   * @returns {string}
   */
  _expandField(abbr) {
    const trimmed = abbr.trim();
    return this.fieldMap[trimmed] || abbr;
  }

  /**
   * Parse structured content from cleaned text
   * @param {string} text
   * @returns {object}
   */
  _parseStructuredContent(text) {
    const result = {
      word: '',
      definitions: [],
      terms: [],
      derivatives: [],
      raw: text,
    };

    // Find "Istilah:" section (case-insensitive)
    const istilahMatch = text.match(/Istilah:\s*([\s\S]*?)(?=Turunan:|$)/i);
    const istilahText = istilahMatch ? istilahMatch[1].trim() : '';

    // Find "Turunan:" section (case-insensitive)
    const turunanMatch = text.match(/Turunan:\s*([\s\S]*?)$/i);
    const turunanText = turunanMatch ? turunanMatch[1].trim() : '';

    // Remove istilah and turunan sections from main text for definition parsing
    let mainText = text;
    if (istilahMatch) {
      mainText = mainText.replace(istilahMatch[0], '');
    }
    if (turunanMatch) {
      mainText = mainText.replace(turunanMatch[0], '');
    }

    this._parseMainDefinitionBlock(mainText, result);

    // Parse istilah (terms) section
    if (istilahText) {
      const termLines = istilahText.split('\n').filter(line => line.trim());
      termLines.forEach(line => {
        const cleaned = line.replace(/^[•\-\s]+/, '').trim();
        if (cleaned) {
          // Expand field abbreviations in parentheses
          const expanded = cleaned.replace(/\(([^)]+)\)/g, (match, abbr) => {
            return `(${this._expandField(abbr)})`;
          });
          result.terms.push(expanded);
        }
      });
    }

    // Parse turunan (derivatives) section
    if (turunanText) {
      const derivLines = turunanText.split('\n').filter(line => line.trim());
      derivLines.forEach(line => {
        const cleaned = line.replace(/^[•\-\s]+/, '').trim();
        if (cleaned && cleaned !== result.word) {
          result.derivatives.push(cleaned);
        }
      });
    }

    // If no istilah/turunan sections found, try to extract from inline text
    if (result.terms.length === 0 && result.derivatives.length === 0) {
      // Look for inline istilah pattern: "-- dan ralat Man ..."
      const inlineIstilahPattern = /--\s+([^;]+?)\s+\(([^)]+)\)\s+([^;]+)/g;
      let istilahMatch;
      while ((istilahMatch = inlineIstilahPattern.exec(text)) !== null) {
        const term = istilahMatch[1].trim();
        const field = this._expandField(istilahMatch[2].trim());
        const definition = istilahMatch[3].trim();
        if (term && definition) {
          result.terms.push(`${term} (${field}) ${definition}`);
        }
      }

      // Look for inline derivatives (words with · that appear after definitions)
      // These are typically prefixed with "men·", "di·", "ter·", "ke·", "se·", "pen·", "per·", "peng·", "pem·", "pen·"
      const allDerivatives = new Set();
      const derivPrefixes = ['men·', 'di·', 'ter·', 'ke·', 'se·', 'pen·', 'per·', 'peng·', 'pem·', 'ber·', 'me·', 'pe·'];
      
      // Find all words with · in the raw text
      const allWordsWithDot = text.match(/\b[a-zA-Z]+(?:·[a-zA-Z]+)+\b/g) || [];
      allWordsWithDot.forEach(word => {
        // Exclude the main word
        if (word !== result.word) {
          allDerivatives.add(word);
        }
      });
      
      result.derivatives = Array.from(allDerivatives);
      
      // If we found derivatives inline but no istilah section, 
      // remove them from the term extraction to avoid duplication
      if (result.derivatives.length > 0 && result.terms.length === 0) {
        // Re-run istilah extraction without derivatives
        const inlineIstilahOnlyPattern = /--\s+([^;]+?)\s+\(([^)]+)\)\s+([^;]+)/g;
        let istilahMatch;
        while ((istilahMatch = inlineIstilahOnlyPattern.exec(text)) !== null) {
          const term = istilahMatch[1].trim();
          const field = this._expandField(istilahMatch[2].trim());
          const definition = istilahMatch[3].trim();
          // Only add if it's not a derivative word
          if (term && definition && !allDerivatives.has(term)) {
            result.terms.push(`${term} (${field}) ${definition}`);
          }
        }
      }
    }

    return result;
  }

  _parseMainDefinitionBlock(mainText, result) {
    const text = mainText.trim();
    if (!text) return;

    const classAlternation = '(?:adv|adj|pron|num|kp|[nvap]|Nomina|Verba|Adjektiva|Adverbia|Pronomina|Numeralia|Partikel|Kata kerja|Kata benda|Kata sifat|Kata keterangan)';
    const headPattern = new RegExp(`^([\\s\\S]*?)\\s+(${classAlternation})(?:\\s*\\([^)]*\\))?\\s+(?=(?:\\(?\\d+\\)|\\d+\\b)|[\\s\\S]+)`, 'i');
    const headMatch = text.match(headPattern);

    let body = text;
    let defaultWordClass = '';

    if (headMatch) {
      result.word = headMatch[1].trim();
      defaultWordClass = this._normalizeWordClass(headMatch[2]);
      body = text.slice(headMatch[0].length).trim();
    } else {
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length >= 2) {
        result.word = lines[0];
        const classLineMatch = lines[1].match(new RegExp(`^(${classAlternation})(?:\\s*\\([^)]*\\))?\\s*(.*)$`, 'i'));
        if (classLineMatch) {
          defaultWordClass = this._normalizeWordClass(classLineMatch[1]);
          body = [classLineMatch[2], ...lines.slice(2)].join('\n').trim();
        }
      }
    }

    if (!result.word) {
      const wordMatch = text.match(/^([\p{L}\p{M}.\u00B7' -]+?)(?:\s+\(?\d+\)?|\n|$)/u);
      if (wordMatch) result.word = wordMatch[1].trim();
    }

    const definitions = [];
    const numberedPattern = /(?:^|[\s;])\(?(\d+)\)?\s+([\s\S]*?)(?=(?:[\s;]\(?\d+\)?\s+)|$)/g;
    let match;

    while ((match = numberedPattern.exec(body)) !== null) {
      let content = match[2].trim();
      let wordClass = defaultWordClass;
      const contentClassMatch = content.match(new RegExp(`^(${classAlternation})\\s+([\\s\\S]+)$`, 'i'));
      if (contentClassMatch && this._isWordClassToken(contentClassMatch[1])) {
        wordClass = this._normalizeWordClass(contentClassMatch[1]);
        content = contentClassMatch[2].trim();
      }

      content = this._cleanDefinitionContent(content);
      if (content) {
        definitions.push({
          number: parseInt(match[1], 10),
          wordClass: wordClass || 'Arti',
          content,
        });
      }
    }

    if (!definitions.length && body) {
      const content = this._cleanDefinitionContent(body);
      if (content) {
        definitions.push({
          number: 1,
          wordClass: defaultWordClass || 'Arti',
          content,
        });
      }
    }

    result.definitions = definitions;
  }

  _cleanDefinitionContent(content) {
    return (content || '')
      .replace(/\s*--\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([;:,.])/g, '$1')
      .trim();
  }

  /**
   * Format parsed definition to human-readable output
   * @param {object} parsed - Parsed definition object
   * @returns {string} Formatted text
   */
  format(parsed) {
    if (!parsed) return '';

    const lines = [];

    // Word header
    if (parsed.word) {
      lines.push(`Kata:`);
      lines.push(parsed.word);
      lines.push('');
    }

    // Numbered definitions
    if (parsed.definitions.length > 0) {
      parsed.definitions.forEach((def, index) => {
        lines.push(`${def.number}. ${def.wordClass}`);
        lines.push(`   ${def.content}`);
        if (index < parsed.definitions.length - 1) {
          lines.push('');
        }
      });
      lines.push('');
    }

    // Terms (Istilah)
    if (parsed.terms.length > 0) {
      lines.push(`Istilah:`);
      parsed.terms.forEach(term => {
        lines.push(`• ${term}`);
      });
      lines.push('');
    }

    // Derivatives (Turunan)
    if (parsed.derivatives.length > 0) {
      lines.push(`Turunan:`);
      parsed.derivatives.forEach(deriv => {
        lines.push(`• ${deriv}`);
      });
      lines.push('');
    }

    // Clean up any remaining artifacts
    let result = lines.join('\n');
    
    // Fix multiple consecutive blank lines
    result = result.replace(/\n{3,}/g, '\n\n');
    
    // Remove trailing whitespace from each line
    result = result.split('\n').map(line => line.trimEnd()).join('\n');
    
    return result.trim();
  }

  /**
   * Quick format method - parse and format in one step
   * @param {string} rawText - Raw KBBI definition text
   * @returns {string} Formatted text
   */
  formatRaw(rawText) {
    const parsed = this.parse(rawText);
    return this.format(parsed);
  }
}

// Export singleton instance
export const kbbiParser = new KbbiParser();
