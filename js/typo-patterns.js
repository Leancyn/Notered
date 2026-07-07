/**
 * typo-patterns.js — Comprehensive Indonesian typo pattern library.
 *
 * Design:
 * - Single-source-of-truth for all hardcoded correction mappings.
 * - Phonetic variants generated lazily per-query (not at module load).
 * - All maps are frozen Object.create(null) for fast property lookup.
 */

// ---------------------------------------------------------------------------
// Tidak-baku (informal/colloquial) → baku corrections
// These are style flags, not outright errors.
// ---------------------------------------------------------------------------
const TIDAK_BAKU_MAP = Object.freeze(Object.assign(Object.create(null), {
  // Abbreviations / slang
  'aja'   : 'saja',
  'sj'    : 'saja',
  'banget': 'sekali',
  'bgt'   : 'sekali',
  'bgtu'  : 'sekali',
  'gini'  : 'begini',
  'gitu'  : 'begitu',
  'gtu'   : 'begitu',
  'gimana': 'bagaimana',
  'gmn'   : 'bagaimana',
  'gmna'  : 'bagaimana',
  'kayak' : 'seperti',
  'kaya'  : 'seperti',
  'kyk'   : 'seperti',
  'cuma'  : 'hanya',
  'cuman' : 'hanya',
  'emang' : 'memang',
  'mang'  : 'memang',
  'udah'  : 'sudah',
  'dah'   : 'sudah',
  'blm'   : 'belum',
  'blom'  : 'belum',
  'nggak' : 'tidak',
  'ngak'  : 'tidak',
  'gak'   : 'tidak',
  'dgn'   : 'dengan',
  'utk'   : 'untuk',
  'dlm'   : 'dalam',
  'ttg'   : 'tentang',
  'krn'   : 'karena',
  'krna'  : 'karena',
  'yg'    : 'yang',
  'adl'   : 'adalah',
  'sy'    : 'saya',
  'sya'   : 'saya',
  'kmrn'  : 'kemarin',
  'bsk'   : 'besok',
  'jm'    : 'jam',
  'mnt'   : 'menit',
  'dtk'   : 'detik',
  'hr'    : 'hari',
  'hari'  : 'hari',

  // Kata tidak baku per KBBI
  'faham'  : 'paham',
  'hapak'  : 'hapak',
  'praktek': 'praktik',
  'sistim' : 'sistem',
  'resiko' : 'risiko',
  'analisa': 'analisis',
  'aktip'  : 'aktif',
  'nopember': 'november',
  'pebruari': 'februari',
  'ijin'   : 'izin',
  'jaman'  : 'zaman',
  'sholat' : 'salat',
  'shalat' : 'salat',
  'insyaallah': 'insyaallah',
  'subhanallah': 'subhanallah',
  'alhamdulilah': 'alhamdulillah',
  'terimakasih': 'terima kasih',
  'terima kasih': 'terima kasih',
  'tanda tangan': 'tanda tangan',
  'silahkan': 'silakan',
  'klo'   : 'kalau',
  'kalo'  : 'kalau',
  'dulu'  : 'dahulu',
  'dlu'   : 'dahulu',
  'gw'    : 'saya',
  'gue'   : 'saya',
  'lo'    : 'kamu',
  'lu'    : 'kamu',
  'elo'   : 'kamu',
  'ngga'  : 'tidak',
  'ga'    : 'tidak',
  'abis'  : 'habis',
  'abiss' : 'habis',
  'lagi'  : 'lagi',
  'malem' : 'malam',
  'pagi'  : 'pagi',
  'siang' : 'siang',
  'bentar': 'sebentar',
  'sebentar': 'sebentar',
  'bakal' : 'akan',
  'entar' : 'nanti',
  'ntar'  : 'nanti',
  'ketemu': 'bertemu',
  'bawa'  : 'bawa',
  'bawain': 'bawakan',
  'kasih' : 'beri',
  'kasiin': 'berikan',
  'nyari' : 'mencari',
  'liat'  : 'lihat',
  'ngomong': 'bicara',
  'omong' : 'bicara',
  'bikin' : 'membuat',
  'dikasih': 'diberikan',
  'dikasih': 'diberikan',
  'ngurusin': 'mengurus',
  'ngurus': 'mengurus',
  'nunggu': 'menunggu',
  'nungguin': 'menunggu',
  'nyimpen': 'menyimpan',
  'simpen': 'simpan',
  'nyanyi': 'bernyanyi',
  'nonton': 'menonton',
  'beliin': 'belikan',
  'balik' : 'kembali',
  'pulkam': 'pulang kampung',
  'mudik' : 'pulang kampung',

  // Abbreviations from common usage
  'dll'   : 'dan lain-lain',
  'dsb'   : 'dan sebagainya',
  'dst'   : 'dan seterusnya',
  'dkk'   : 'dan kawan-kawan',
  'tsb'   : 'tersebut',
  'tdk'   : 'tidak',
  'sdh'   : 'sudah',
  'blm2'  : 'belum',
  'jg'    : 'juga',
  'juga'  : 'juga',
  'spt'   : 'seperti',
  'kpd'   : 'kepada',
  'dr'    : 'dari',
  'pd'    : 'pada',
  'dg'    : 'dengan',
  'sm'    : 'sama',
  'ama'   : 'sama',

  // Common word confusions
  'sangat2': 'sangat-sangat',
}));

// ---------------------------------------------------------------------------
// Pure typo corrections (keyboard errors, transpositions, missing letters)
// These are marked as "error" in spell check, not "tidak_baku".
// ---------------------------------------------------------------------------
const TYPO_MAP = Object.freeze(Object.assign(Object.create(null), {
  // "aplikasi" family
  'apliksi'  : 'aplikasi',
  'aplkasi'  : 'aplikasi',
  'apliksii' : 'aplikasi',
  'apliksai' : 'aplikasi',
  'aplikais' : 'aplikasi',
  'aplkasi'  : 'aplikasi',
  'aplkiasi' : 'aplikasi',
  'apliaksi' : 'aplikasi',

  // Common keyboard typos
  'tuliss'   : 'tulis',
  'membacaa' : 'membaca',
  'menuliss' : 'menulis',
  'bukak'    : 'buka',
  'memasukan': 'memasukkan',
  'mempergunakan': 'menggunakan',
  'mempergunakan': 'menggunakan',
  'diliat'   : 'dilihat',
  'diambilkan': 'diambilkan',
  'kerjaan'  : 'pekerjaan',

  // Number-related
  'st'       : 'satu',
  'dua'      : 'dua',

  // Doubled letters
  'membacaaa': 'membaca',
  'menulisss': 'menulis',
}));

// ---------------------------------------------------------------------------
// Phonetic variant rules (applied lazily per-query)
// ---------------------------------------------------------------------------

/** Generate common phonetic/orthographic variants of an Indonesian word */
export function generatePhoneticVariants(word) {
  const lower = (word ?? '').toLowerCase();
  const variants = new Set();

  // 1. ny ↔ ng swap
  if (lower.includes('ng')) variants.add(lower.replace(/ng/g, 'ny'));
  if (lower.includes('ny')) variants.add(lower.replace(/ny/g, 'ng'));

  // 2. Collapse triple+ letters to double (gassss → gass)
  const collapsed = lower.replace(/([a-z])\1{2,}/gi, '$1$1');
  if (collapsed !== lower) variants.add(collapsed);

  // 3. Collapse double letters to single (tuliss → tulis)
  const singleCollapsed = lower.replace(/([a-z])\1+/gi, '$1');
  if (singleCollapsed !== lower && singleCollapsed.length >= 3) variants.add(singleCollapsed);

  // 4. Common Indonesian phonetic substitutions
  // f ↔ p
  if (lower.includes('f')) variants.add(lower.replace(/f/g, 'p'));
  if (lower.includes('p')) variants.add(lower.replace(/p/g, 'f'));

  // z ↔ j
  if (lower.includes('z')) variants.add(lower.replace(/z/g, 'j'));
  if (lower.includes('j')) variants.add(lower.replace(/j/g, 'z'));

  // v ↔ f ↔ w
  if (lower.includes('v')) {
    variants.add(lower.replace(/v/g, 'f'));
    variants.add(lower.replace(/v/g, 'w'));
  }

  // 5. Vowel confusion a ↔ e
  if (lower.includes('e')) variants.add(lower.replace(/e/g, 'a'));
  if (lower.includes('a')) {
    const withE = lower.replace(/a(?=[^aiou\s])/g, 'e');
    if (withE !== lower) variants.add(withE);
  }

  // Remove the original word itself from variants
  variants.delete(lower);

  return Array.from(variants);
}

/** Direct lookup from combined typo + tidak-baku maps */
export function checkCommonTypos(word) {
  const lower = (word ?? '').toLowerCase();
  return TYPO_MAP[lower] || TIDAK_BAKU_MAP[lower] || null;
}

/** Get a combined map (used for Autocorrect candidate seeding) */
export function getCommonTypoMap() {
  // Merge: typo_map has priority
  return { ...TIDAK_BAKU_MAP, ...TYPO_MAP };
}

/** Expose individual maps for SpellChecker classification */
export { TIDAK_BAKU_MAP, TYPO_MAP };
