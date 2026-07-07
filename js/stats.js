/**
 * stats.js - Text Metrics and Document Statistics
 * 
 * Computes word, char, sentence, and paragraph counts.
 * Calculates vocabulary accuracy based on spellcheck results.
 */

export class Stats {
  /**
   * Calculate full document statistics
   * @param {string} text - Clean document text
   * @param {Map} spellResults - Map of checked word -> result
   * @returns {object} Stats metrics
   */
  static calculate(text, spellResults = new Map()) {
    const cleanText = text.trim();
    if (!cleanText) {
      return {
        words: 0, chars: 0, charsNoSpace: 0,
        sentences: 0, paragraphs: 0,
        correctWords: 0, errorWords: 0, warningWords: 0,
        accuracy: 100, readTime: '< 1 menit'
      };
    }

    // Tokenize text into words
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    
    // Character statistics
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;

    // Sentence heuristics: split by punctuation marks followed by spaces/newlines
    const sentences = text.split(/[.!?]+(\s+|$)/).filter(s => s && s.trim().length > 0).length;

    // Paragraph heuristics: split by double newlines
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

    // Accuracy and spell statistics
    let correctWords = 0;
    let errorWords = 0;
    let warningWords = 0;
    let checkedCount = 0;

    for (const rawWord of words) {
      // Clean word from punctuation
      const cleanWord = rawWord.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!cleanWord || /^[0-9]+$/.test(cleanWord)) continue;

      const result = spellResults.get(cleanWord);
      if (result && result.type !== 'ignored') {
        checkedCount++;
        if (result.type === 'correct' || result.type === 'whitelisted') {
          correctWords++;
        } else if (result.type === 'error') {
          errorWords++;
        } else if (result.type === 'tidak_baku') {
          warningWords++;
        }
      }
    }

    const accuracy = checkedCount > 0 ? Math.round((correctWords / checkedCount) * 100) : 100;
    
    // Average reading time (adult reading speed ~ 200 WPM)
    const minutes = Math.ceil(words.length / 200);
    const readTime = minutes > 0 ? `${minutes} menit` : '< 1 menit';

    return {
      words: words.length,
      chars,
      charsNoSpace,
      sentences: sentences || 1,
      paragraphs: paragraphs || 1,
      correctWords,
      errorWords,
      warningWords,
      accuracy,
      readTime
    };
  }
}
