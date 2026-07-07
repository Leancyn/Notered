/**
 * stemmer.js - Simplified Indonesian Word Stemmer
 * 
 * Implements Indonesian prefix, suffix, and confix removal rules
 * based on Nazief-Adriani principles with morphological exceptions.
 */

// Irregular stems mapping
const IRREGULAR_WORDS = {
  'belajar': 'ajar',
  'pelajar': 'ajar',
  'mengajar': 'ajar',
  'pengajar': 'ajar',
  'pembelajaran': 'ajar',
  'mempunyai': 'punya',
  'menyanyi': 'nyanyi',
  'penyanyi': 'nyanyi',
  'beterbangan': 'terbang',
  'penerbangan': 'terbang',
  'berterbangan': 'terbang',
  'menerbangkan': 'terbang',
  'melihat': 'lihat',
  'kelihatan': 'lihat',
  'penglihatan': 'lihat'
};

/**
 * Stem a single Indonesian word back to its base form
 * @param {string} word - Input word (lowercase, alphabetic)
 * @returns {string} Base word (stemmed)
 */
export function stem(word) {
  // Normalize
  word = word.trim().toLowerCase();
  
  // Length check - Indonesian base words are at least 3 characters
  if (word.length < 3) return word;

  // Direct lookup for irregular/pre-computed stems
  if (IRREGULAR_WORDS[word]) {
    return IRREGULAR_WORDS[word];
  }

  let originalWord = word;

  // Step 1: Remove Inflectional Suffixes (-lah, -kah, -tah, -pun)
  word = removeInflectionalSuffix(word);

  // Step 2: Remove Possessive Suffixes (-ku, -mu, -nya)
  word = removePossessiveSuffix(word);

  // Step 3: Remove Derivational Suffixes (-kan, -an, -i)
  word = removeDerivationalSuffix(word);

  // Step 4: Remove Derivational Prefixes (me-, ber-, di-, pe-, ter-, ke-, se-)
  word = removeDerivationalPrefix(word);

  // If stemming ruined the word too much, fallback to original
  if (word.length < 2) {
    return originalWord;
  }

  return word;
}

function removeInflectionalSuffix(word) {
  if (word.endsWith('lah') || word.endsWith('kah') || word.endsWith('tah') || word.endsWith('pun')) {
    return word.slice(0, -3);
  }
  return word;
}

function removePossessiveSuffix(word) {
  if (word.endsWith('nya')) {
    return word.slice(0, -3);
  }
  if (word.endsWith('ku') || word.endsWith('mu')) {
    return word.slice(0, -2);
  }
  return word;
}

function removeDerivationalSuffix(word) {
  if (word.endsWith('kan')) {
    return word.slice(0, -3);
  }
  if (word.endsWith('an')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('i') && !word.endsWith('si') && !word.endsWith('ti') && !word.endsWith('li')) {
    return word.slice(0, -1);
  }
  return word;
}

function removeDerivationalPrefix(word) {
  // 1. di-
  if (word.startsWith('di') && word.length > 3) {
    return word.slice(2);
  }
  
  // 2. ke-
  if (word.startsWith('ke') && word.length > 3 && !word.startsWith('kerja') && !word.startsWith('keras')) {
    return word.slice(2);
  }

  // 3. se-
  if (word.startsWith('se') && word.length > 3) {
    return word.slice(2);
  }

  // 4. ter-
  if (word.startsWith('ter') && word.length > 4) {
    return word.slice(3);
  }
  if (word.startsWith('te') && word.charAt(2) === 'r') {
    return word.slice(2);
  }

  // 5. ber-
  if (word.startsWith('ber') && word.length > 4) {
    return word.slice(3);
  }
  if (word.startsWith('be') && word.length > 3) {
    // Handling e.g. "bekerja" -> "kerja"
    if (word.startsWith('bekerja')) return 'kerja';
    return word.slice(2);
  }

  // 6. me- (Complex morphophonemic rules)
  if (word.startsWith('me')) {
    return removeMePrefix(word);
  }

  // 7. pe- (similar to me-)
  if (word.startsWith('pe')) {
    return removePePrefix(word);
  }

  return word;
}

function removeMePrefix(word) {
  // me-
  if (word.startsWith('meng')) {
    const stem = word.slice(4);
    // meng[vowel] -> e.g. mengudara -> udara, mengikat -> ikat
    // or meng[k] -> luluh e.g. mengkritik -> kritik, mengupas -> kupas (adds 'k')
    if (/^[aeiou]/.test(stem)) {
      return stem; // e.g. mengalir -> alir
    }
    // Try restoring 'k'
    return 'k' + stem; 
  }

  if (word.startsWith('meny')) {
    // meny[s] -> luluh e.g. menyiram -> siram, menyalin -> salin (restores 's')
    return 's' + word.slice(4);
  }

  if (word.startsWith('memb')) {
    // mem+b -> e.g. membawa -> bawa
    return word.slice(3); // mem + b... -> b...
  }

  if (word.startsWith('mem')) {
    const stem = word.slice(3);
    // mem+p -> luluh e.g. memotong -> potong (restores 'p')
    return 'p' + stem;
  }

  if (word.startsWith('mend') || word.startsWith('menj') || word.startsWith('menc')) {
    // men[d|j|c] -> e.g. mendengar -> dengar, mencari -> cari
    return word.slice(3);
  }

  if (word.startsWith('men')) {
    const stem = word.slice(3);
    // men+t -> luluh e.g. menulis -> tulis (restores 't')
    return 't' + stem;
  }

  // me- general prefix
  return word.slice(2);
}

function removePePrefix(word) {
  if (word.startsWith('peng')) {
    const stem = word.slice(4);
    if (/^[aeiou]/.test(stem)) {
      return stem; // pengantar -> antar
    }
    return 'k' + stem; // pengupas -> kupas
  }

  if (word.startsWith('peny')) {
    return 's' + word.slice(4); // penyiram -> siram
  }

  if (word.startsWith('pemb')) {
    return word.slice(3); // pembawa -> bawa
  }

  if (word.startsWith('pem')) {
    return 'p' + word.slice(3); // pemotong -> potong
  }

  if (word.startsWith('pend') || word.startsWith('penj') || word.startsWith('penc')) {
    return word.slice(3);
  }

  if (word.startsWith('pen')) {
    return 't' + word.slice(3); // penulis -> tulis
  }

  if (word.startsWith('per')) {
    return word.slice(3); // perdamaian -> damai (after suffixes)
  }

  return word.slice(2);
}
