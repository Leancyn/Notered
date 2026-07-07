/**
 * typo-patterns.js - Common Indonesian typo patterns and rules
 *
 * Provides pattern-based typo detection and correction for common
 * Indonesian spelling mistakes that may not be in the dictionary.
 */

// Common Indonesian vowel confusion patterns
const VOWEL_CONFUSION = {
  // a <-> e confusion
  'mneulis': 'menulis',
  'mnulis': 'menulis',
  'mleka': 'meledak',
  'mlekit': 'melihat',
  'bgitu': 'begitu',
  'bgimana': 'bagaimana',
  'sya': 'saya',
  'sy': 'saya',
  
  // i <-> e confusion
  'ngliat': 'melihat',
  'ngeliat': 'melihat',
  
  // Double letter issues
  'mme': 'mem',
  'nng': 'ng',
  'kk': 'k',
  'bb': 'b',
  'dd': 'd',
  'nn': 'n',
  'tt': 't',
  'pp': 'p',
};

// Common prefix/suffix typos
const PREFIX_SUFFIX_TYPOS = {
  // me- prefix issues
  'mng': 'meng',
  'mn': 'men',
  'mngg': 'meng',
  'mnggil': 'menggilang',
  
  // ter- prefix
  'tr': 'ter',
  'trr': 'ter',
  
  // ber- prefix
  'br': 'ber',
  'brr': 'ber',
  
  // di- prefix
  'dg': 'di',
  'dgg': 'di',
  
  // ke- prefix
  'ka': 'ke',
  
  // se- prefix
  'sa': 'se',
  
  // -nya suffix
  'nyaa': 'nya',
  'nyaaa': 'nya',
  
  // -kan suffix
  'kn': 'kan',
  'kann': 'kan',
  
  // -an suffix
  'ann': 'an',
};

// Common Indonesian word confusions (tidak baku / typo)
const COMMON_WORD_MISTAKES = {
  // Very common typos
  'nggak': 'tidak',
  'ngak': 'tidak',
  'gak': 'tidak',
  'udah': 'sudah',
  'dah': 'sudah',
  'blm': 'belum',
  'blom': 'belum',
  'aja': 'saja',
  'sj': 'saja',
  'mau': 'hendak',
  'banget': 'sekali',
  'bgt': 'sekali',
  'bgtu': 'sekali',
  'gini': 'begini',
  'gitu': 'begitu',
  'gtu': 'begitu',
  'gimana': 'bagaimana',
  'gmn': 'bagaimana',
  'gmna': 'bagaimana',
  'kayak': 'seperti',
  'kaya': 'seperti',
  'kyk': 'seperti',
  'cuma': 'hanya',
  'cm': 'hanya',
  'cuman': 'hanya',
  'emang': 'memang',
  'mang': 'memang',
  
  // Common spelling errors
  'tuliss': 'tulis',
  'bukak': 'buka',
  
  // Common word confusions
  'dgn': 'dengan',
  'utk': 'untuk',
  'dlm': 'dalam',
  'ttg': 'tentang',
  'krn': 'karena',
  'dll': 'dan lain-lain',
  'dsb': 'dan sebagainya',
  'dst': 'dan seterusnya',
  
  // Common typos with similar sounds
  'adl': 'adalah',
  'yg': 'yang',
  'krna': 'karena',
  
  // Double letter typos
  'membacaa': 'membaca',
  'membacaaa': 'membaca',
  'menuliss': 'menulis',
  
  // Common Indonesian words with typos
  'kmrn': 'kemarin',
  'bsk': 'besok',
  'hr': 'hari',
  
  // Time related
  'jm': 'jam',
  'mnt': 'menit',
  'dtk': 'detik',
  
  // Number related
  'st': 'satu',
};

/**
 * Check if a word matches common typo patterns
 * @param {string} word - The word to check
 * @returns {string|null} - The corrected word or null if no match
 */
export function checkCommonTypos(word) {
  const lower = word.toLowerCase();
  
  // Direct lookup
  if (VOWEL_CONFUSION[lower]) return VOWEL_CONFUSION[lower];
  if (PREFIX_SUFFIX_TYPOS[lower]) return PREFIX_SUFFIX_TYPOS[lower];
  if (COMMON_WORD_MISTAKES[lower]) return COMMON_WORD_MISTAKES[lower];
  
  return null;
}

/**
 * Generate phonetic variants of a word
 * @param {string} word - The word to generate variants for
 * @returns {string[]} - Array of possible variants
 */
export function generatePhoneticVariants(word) {
  const variants = [];
  const lower = word.toLowerCase();
  
  // ng <-> ny swap (common Indonesian confusion)
  if (lower.includes('ng')) {
    variants.push(lower.replace(/ng/g, 'ny'));
  }
  if (lower.includes('ny')) {
    variants.push(lower.replace(/ny/g, 'ng'));
  }
  
  // Double letter reduction (more than double -> double)
  const doubleReduced = lower.replace(/([a-z])\1{2,}/gi, '$1$1');
  if (doubleReduced !== lower) {
    variants.push(doubleReduced);
  }
  
  return variants;
}

/**
 * Get all common typo corrections
 * @returns {object} - The typo map
 */
export function getCommonTypoMap() {
  return {
    ...VOWEL_CONFUSION,
    ...PREFIX_SUFFIX_TYPOS,
    ...COMMON_WORD_MISTAKES,
  };
}