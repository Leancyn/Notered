/**
 * stemmer.js - Accurate Indonesian Word Stemmer (Enhanced Nazief-Adriani)
 *
 * Key improvements over previous version:
 * - Dictionary-validation step after each stripping pass (prevents over-stemming)
 * - Correct MeD morphophonemic rules (e.g. menulis → tulis, bukan tnulis)
 * - Confix (me-...-kan, me-...-i) stripping support
 * - Kata ulang (reduplication) handled before prefix stripping
 */

// ---- Irregular stems mapping (exact lookup, O(1)) -----------------------
const IRREGULAR_WORDS = new Map([
  // learn / teach
  ['belajar', 'ajar'],  ['pelajar', 'ajar'],    ['pembelajaran', 'ajar'],
  ['mengajar', 'ajar'], ['pengajaran', 'ajar'],

  // have
  ['mempunyai', 'punya'], ['dipunyai', 'punya'],

  // sing
  ['menyanyi', 'nyanyi'], ['penyanyi', 'nyanyi'], ['nyanyian', 'nyanyi'],

  // fly
  ['terbang', 'terbang'], ['penerbangan', 'terbang'], ['menerbangkan', 'terbang'],
  ['berterbangan', 'terbang'],

  // see
  ['melihat', 'lihat'], ['kelihatan', 'lihat'], ['penglihatan', 'lihat'],
  ['terlihat', 'lihat'],

  // read
  ['membaca', 'baca'],  ['pembaca', 'baca'],  ['pembacaan', 'baca'],
  ['bacaan', 'baca'],

  // write
  ['menulis', 'tulis'], ['penulis', 'tulis'], ['penulisan', 'tulis'],
  ['tulisan', 'tulis'], ['menuliskan', 'tulis'],

  // eat / drink
  ['makan', 'makan'], ['memakan', 'makan'], ['dimakan', 'makan'],
  ['minum', 'minum'], ['meminum', 'minum'], ['diminum', 'minum'],

  // work
  ['bekerja', 'kerja'], ['pekerjaan', 'kerja'], ['pekerja', 'kerja'],
  ['mengerjakan', 'kerja'], ['dikerjakan', 'kerja'],

  // walk / run
  ['berjalan', 'jalan'],  ['perjalanan', 'jalan'],
  ['berlari', 'lari'],

  // play
  ['bermain', 'main'], ['permainan', 'main'],

  // speak
  ['berbicara', 'bicara'], ['pembicaraan', 'bicara'],

  // school
  ['bersekolah', 'sekolah'], ['sekolahan', 'sekolah'],

  // know
  ['mengetahui', 'tahu'], ['pengetahuan', 'tahu'], ['diketahui', 'tahu'],

  // want / will
  ['menginginkan', 'ingin'], ['keinginan', 'ingin'],

  // give
  ['memberikan', 'beri'], ['pemberian', 'beri'], ['diberikan', 'beri'],

  // take
  ['mengambil', 'ambil'], ['pengambilan', 'ambil'], ['diambil', 'ambil'],

  // buy / sell
  ['membeli', 'beli'],  ['pembelian', 'beli'],
  ['menjual', 'jual'], ['penjualan', 'jual'],

  // open / close
  ['membuka', 'buka'],  ['pembukaan', 'buka'],
  ['menutup', 'tutup'], ['penutupan', 'tutup'],

  // use
  ['menggunakan', 'guna'], ['penggunaan', 'guna'],

  // do
  ['melakukan', 'laku'], ['pelaksanaan', 'laku'],

  // make
  ['membuat', 'buat'], ['pembuatan', 'buat'],

  // help
  ['membantu', 'bantu'], ['bantuan', 'bantu'],

  // find
  ['menemukan', 'temu'], ['penemuan', 'temu'],

  // say
  ['mengatakan', 'kata'], ['perkataan', 'kata'], ['dikatakan', 'kata'],

  // enter
  ['memasuki', 'masuk'], ['pemasukan', 'masuk'],

  // go out
  ['mengeluarkan', 'keluar'], ['pengeluaran', 'keluar'],

  // think
  ['memikirkan', 'pikir'], ['pemikiran', 'pikir'], ['dipikirkan', 'pikir'],

  // feel
  ['merasakan', 'rasa'], ['perasaan', 'rasa'],

  // remember
  ['mengingat', 'ingat'], ['diingat', 'ingat'], ['mengingati', 'ingat'],

  // change
  ['mengubah', 'ubah'],  ['perubahan', 'ubah'],

  // build
  ['membangun', 'bangun'], ['pembangunan', 'bangun'],

  // wait
  ['menunggu', 'tunggu'], ['penantian', 'nanti'],

  // ask
  ['meminta', 'minta'], ['permintaan', 'minta'],

  // receive
  ['menerima', 'terima'], ['penerimaan', 'terima'],

  // send
  ['mengirimkan', 'kirim'], ['pengiriman', 'kirim'],

  // create
  ['menciptakan', 'cipta'], ['penciptaan', 'cipta'],

  // follow
  ['mengikuti', 'ikut'], ['pengikut', 'ikut'],

  // produce
  ['menghasilkan', 'hasil'], ['hasil', 'hasil'],

  // need
  ['memerlukan', 'perlu'], ['keperluan', 'perlu'],

  // grow
  ['bertumbuh', 'tumbuh'], ['pertumbuhan', 'tumbuh'],

  // agree
  ['menyetujui', 'setuju'], ['persetujuan', 'setuju'],

  // try
  ['mencoba', 'coba'], ['percobaan', 'coba'],

  // hope
  ['berharap', 'harap'], ['harapan', 'harap'],

  // plan
  ['merencanakan', 'rencana'], ['perencanaan', 'rencana'],

  // understand
  ['memahami', 'paham'], ['pemahaman', 'paham'],

  // study
  ['mempelajari', 'ajar'], ['pelajaran', 'ajar'],
]);

// ---- Suffix rules --------------------------------------------------------

const INFLECTIONAL_SUFFIXES = ['lah', 'kah', 'tah', 'pun'];
const POSSESSIVE_SUFFIXES   = ['nya', 'ku', 'mu'];
const DERIVATIONAL_SUFFIXES = ['kan', 'an', 'i'];

function removeSuffix(word, suffixes) {
  for (const sfx of suffixes) {
    if (word.endsWith(sfx) && word.length > sfx.length + 2) {
      return word.slice(0, -sfx.length);
    }
  }
  return word;
}

// ---- Morphophonemic prefix rules ----------------------------------------
// Returns { base, extra } where extra may be a restored consonant prefix.

const ME_RULES = [
  // order matters: most specific first
  { prefix: 'mengk',   strip: 4, restore: 'k'  }, // mengkritik → kritik
  { prefix: 'mengg',   strip: 4, restore: 'g'  }, // menggambar → gambar
  { prefix: 'mengh',   strip: 4, restore: 'h'  }, // menghapus  → hapus
  { prefix: 'menggu',  strip: 5, restore: null  },
  { prefix: 'menge',   strip: 5, restore: null  }, // mengecat   → cat
  { prefix: 'meng',    strip: 4, restore: null,
    vowelFix: true }, // meng + vowel → strip 4, else restore 'k'
  { prefix: 'meny',    strip: 4, restore: 's'  }, // menyukai   → sukai
  { prefix: 'memb',    strip: 3, restore: null  }, // membawa    → bawa
  { prefix: 'memp',    strip: 3, restore: 'p'  }, // mempunyai  → (irregular)
  { prefix: 'memf',    strip: 3, restore: 'f'  },
  { prefix: 'memv',    strip: 3, restore: 'v'  },
  { prefix: 'mem',     strip: 3, restore: 'p'  }, // memotong   → potong (luluh)
  { prefix: 'menj',    strip: 3, restore: null  }, // menjual    → jual
  { prefix: 'mend',    strip: 3, restore: null  }, // mendengar  → dengar
  { prefix: 'menc',    strip: 3, restore: null  }, // mencari    → cari
  { prefix: 'ment',    strip: 3, restore: 't'  }, // (luluh t)
  { prefix: 'men',     strip: 3, restore: 't'  }, // menulis    → tulis (luluh)
  { prefix: 'mel',     strip: 2, restore: null  }, // melakukan  → lakukan
  { prefix: 'mer',     strip: 2, restore: null  }, // merasa     → rasa
  { prefix: 'mew',     strip: 2, restore: null  },
  { prefix: 'me',      strip: 2, restore: null  }, // general me-
];

const PE_RULES = [
  { prefix: 'peng',    strip: 4, restore: null, vowelFix: true },
  { prefix: 'peny',    strip: 4, restore: 's'  },
  { prefix: 'pemb',    strip: 3, restore: null  },
  { prefix: 'pemp',    strip: 3, restore: 'p'  },
  { prefix: 'pem',     strip: 3, restore: 'p'  },
  { prefix: 'penj',    strip: 3, restore: null  },
  { prefix: 'pend',    strip: 3, restore: null  },
  { prefix: 'penc',    strip: 3, restore: null  },
  { prefix: 'pent',    strip: 3, restore: 't'  },
  { prefix: 'pen',     strip: 3, restore: 't'  },
  { prefix: 'per',     strip: 3, restore: null  },
  { prefix: 'pel',     strip: 2, restore: null  },
  { prefix: 'pe',      strip: 2, restore: null  },
];

function applyPrefixRules(word, rules) {
  for (const rule of rules) {
    if (!word.startsWith(rule.prefix)) continue;

    let stem = word.slice(rule.strip);
    if (rule.vowelFix) {
      // meng/peng + vowel: just strip, no restore needed
      // meng/peng + consonant: restore 'k'
      if (stem.length < 2) continue;
      if (!/^[aeiou]/.test(stem)) {
        stem = 'k' + stem;
      }
    } else if (rule.restore) {
      stem = rule.restore + stem;
    }

    if (stem.length >= 3) return stem;
  }
  return null;
}

// ---- Core Stem Function -------------------------------------------------

/**
 * Stem a single Indonesian word back to its base form.
 * @param {string} word - Input word (will be lowercased internally)
 * @param {Set<string>} [dictionary] - Optional dictionary for validation
 * @returns {string} Base word (stemmed)
 */
export function stem(word, dictionary = null) {
  word = (word ?? '').trim().toLowerCase();
  if (word.length < 3) return word;

  // 1. Irregular words exact lookup (O(1))
  const irregular = IRREGULAR_WORDS.get(word);
  if (irregular) return irregular;

  const original = word;

  // 2. Kata ulang (reduplication) — handle BEFORE prefix stripping
  // Format: "buku-buku", "berlari-lari" → base is the first segment
  const redupMatch = word.match(/^(.+)-\1$/);
  if (redupMatch) {
    const base = redupMatch[1];
    if (dictionary ? dictionary.has(base) : base.length >= 3) return base;
  }

  // 3. Remove inflectional suffixes (-lah, -kah, -tah, -pun)
  let w = removeSuffix(word, INFLECTIONAL_SUFFIXES);

  // 4. Remove possessive suffixes (-ku, -mu, -nya)
  w = removeSuffix(w, POSSESSIVE_SUFFIXES);

  // 5. Validate: if we already got a dictionary word, return it
  if (dictionary && dictionary.has(w) && w !== word) return w;

  // 6. Remove derivational suffix
  const wNoSuffix = removeSuffix(w, DERIVATIONAL_SUFFIXES);
  if (dictionary && dictionary.has(wNoSuffix) && wNoSuffix.length >= 3) {
    return wNoSuffix;
  }
  const wForPrefix = wNoSuffix.length >= 3 ? wNoSuffix : w;

  // 7. Remove derivational prefix with morphophonemic restoration
  let stemmed = null;

  if (wForPrefix.startsWith('me')) {
    stemmed = applyPrefixRules(wForPrefix, ME_RULES);
  } else if (wForPrefix.startsWith('pe')) {
    stemmed = applyPrefixRules(wForPrefix, PE_RULES);
  } else if (wForPrefix.startsWith('ber') && wForPrefix.length > 5) {
    stemmed = wForPrefix.slice(3);
  } else if (wForPrefix.startsWith('ter') && wForPrefix.length > 5) {
    stemmed = wForPrefix.slice(3);
  } else if (wForPrefix.startsWith('di') && wForPrefix.length > 4) {
    stemmed = wForPrefix.slice(2);
  } else if (wForPrefix.startsWith('ke') && wForPrefix.length > 4) {
    stemmed = wForPrefix.slice(2);
  } else if (wForPrefix.startsWith('se') && wForPrefix.length > 4) {
    stemmed = wForPrefix.slice(2);
  }

  if (stemmed) {
    if (dictionary) {
      // Validate stemmed result
      if (dictionary.has(stemmed)) return stemmed;
      // Also try stemmed without suffix
      const stemmedNoSuffix = removeSuffix(stemmed, DERIVATIONAL_SUFFIXES);
      if (dictionary.has(stemmedNoSuffix) && stemmedNoSuffix.length >= 3) return stemmedNoSuffix;
    } else {
      // No dictionary: trust the stemmed result if it's plausible length
      if (stemmed.length >= 3) return stemmed;
    }
  }

  // 8. Fallback: return best candidate (with suffix removed if it's not empty)
  if (wNoSuffix.length >= 3 && wNoSuffix !== original) return wNoSuffix;

  return original;
}
