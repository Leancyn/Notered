# Analisis Optimasi KBBI untuk Notered

## Ringkasan Implementasi Saat Ini

Notered memiliki sistem KBBI yang sangat solid dengan arsitektur yang terencana dengan baik:

### Kekuatan yang Sudah Ada
1. **Dictionary Engine** (`dictionary.js`)
   - Set untuk O(1) exact lookup
   - Trie untuk autocomplete
   - SymSpell delete index untuk fuzzy search
   - IndexedDB caching untuk performa startup

2. **Spell Check Pipeline** (`spellcheck.js`)
   - 10-layer validation: whitelist → typo maps → dictionary → stemming → fuzzy
   - Per-strategy caching (Map-based)
   - Reduplication detection (buku-buku)

3. **KBBI Integration**
   - Validator (`kbbi-validator.js`) - memastikan format Definition lengkap
   - Parser (`kbbi-parser.js`) - parsing struktur definisi
   - API fallback (`kbbi-api.js`) untuk kata yang tidak ada di dataset lokal

4. **Autocorrect** (`autocorrect.js`)
   - Multi-source ranking (typo_map → tidak_baku → phonetic → symspell)
   - Sørensen–Dice bigram coefficient untuk similarity scoring
   - Word frequency table untuk ranking suggestions

## Analisis Paragraf Novel

Paragraf yang diberikan menggunakan bahasa Indonesialetterar yang standar:

```
"Hujan turun pelan, memantulkan cahaya lampu jalan yang temaram di atas aspal yang basah. 
Raka menghentikan langkahnya ketika melihat Nara masih berdiri di bawah halte tua itu, 
memeluk tasnya erat seolah sedang menyembunyikan sesuatu..."
```

**Kata-kata kunci dalam paragraf:**
- `temaram` - adjective, ada di KBBI
- `memantulkan` - verb (memantulkan), ada di KBBI
- `aspal` - noun, ada di KBBI
- `menghentikan` - verb, ada di KBBI
- `halte` - noun (loanword), ada di KBBI
- `memeluk` - verb, ada di KBBI
- `menyembunyikan` - verb, ada di KBBI
- `mengembuskan` - verb, ada di KBBI
- `lirih` - adverb, ada di KBBI
- `kesedihan` - noun, ada di KBBI
- `mengangguk` - verb, ada di KBBI

**Kesimpulan:** Paragraf ini menggunakan bahasa Indonesia yang benar dan baku. Tidak ada kata tidak baku atau kesalahan ejaan. Sistem KBBI saat ini sudah cukup menangani konten seperti ini.

## Rekomendasi Optimasi

### 1. Perbaikan Validator: Loosen Sequential Numbering Check

**Masalah:** Validator saat ini terlalu ketat dalam memeriksa urutan nomor arti. Untuk entri KBBI yang kompleks dengan sub-sense dan homograf, restart numbering (misal: 1 2 3 1 2 3) adalah normal.

**Solusi:** Sudah diimplementasikan dengan benar di `kbbi-validator.js` lines 232-246, tetapi bisa ditambahkan logging untuk debugging.

### 2. Peningkatan Parser: Handle Kompleksitas Morfologi

**Masalah:** Verb forms complex seperti `mengembuskan`, `menyembunyikan` perlu stemming yang akurat.

**Solusi yang Direkomendasikan:**
```javascript
// Di stemmer.js - tambahkan prefix handling untuk verba ber-
const VERB_PREFIXES = ['me', 'men', 'mem', 'meng', 'meny', 'pen', 'pem', 'peng', 'di', 'ter', 'ke', 'se'];
```

### 3. Optimasi Cross-Reference Resolution

**Masalah:** Resolusi "Lihat X" masih bisa gagal jika case tidak match atau jika target punya multiple forms.

**Rekomendasi:**
- Tambahkan fuzzy matching pada cross-reference target
- Cache hasil resolusi untuk menghindari repeated API calls

```javascript
// Di app.js _resolveKbbiCrossReference - tambahkan cache
if (!this._crossRefCache) this._crossRefCache = new Map();
const cacheKey = `${wordToLookup}:${target}`;
if (this._crossRefCache.has(cacheKey)) {
  return this._crossRefCache.get(cacheKey);
}
```

### 4. Perluasan Coverage Dictionary

**Kata-kata letterar yangMUNGKIN missing dari dataset:**
- `temaram` (check: exists in KBBI)
- `lirih` (adverbia - bisa jadi tidak ada)
- `halte` (loanword - biasanya ada)

**Solusi:** Tambahkan manual whitelist untuk kata-kata letterar umum:

```javascript
// Di spellcheck.js - tambahkan ke WHITELIST
const LITERARY_WHITELIST = new Set([
  'temaram', 'lirih', 'bisik', 'rintih', 'senggut',
  // Kata-kata puisi/novel yang sering muncul
]);
```

### 5. Optimasi Performance untuk Dokument Panjang

**Current bottleneck:** `_buildAnnotatedHtml()` rebuild seluruh HTML pada setiap spellcheck pass.

**Optimasi yang Sudah Bagus:**
- Mark-based rendering (hanya update kata yang berubah)
- Debounce 800ms
- Caching per-word check results

**Tambahan yang Bisa Ditambahkan:**
```javascript
// Batch process dengan requestIdleCallback
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => this._processText());
} else {
  setTimeout(() => this._processText(), 800);
}
```

### 6. Peningkatan KBBI API Fallback

**Current:** API fallback hanya dipanggil jika kata tidak ada di dictionary.

**Improvement:** Tambahkan retry mechanism dan timeout:

```javascript
// Di kbbi-api.js
const API_TIMEOUT = 3000; // 3 seconds
const MAX_RETRIES = 2;

async lookup(word) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await Promise.race([
        this._fetchDefinition(word),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), API_TIMEOUT)
        )
      ]);
      return result;
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) throw e;
      await new Promise(r => setTimeout(r, 500)); // backoff
    }
  }
}
```

### 7. Tambahan: Context-Aware Suggestion Ranking

Untuk konten letterar, prioritaskan suggestions yang:
- Memiliki connotation yang sesuai dengan konteks emosional
- Memiliki part-of-speech yang sama dengan kata asli

Contoh: Jika kata error adalah adjective, prioritaskan adjective corrections.

## Prioritas Implementasi

### Tingkat Tinggi (High Impact)
1. **Cross-reference caching** - mengurangi API calls yang tidak perlu
2. **Whitelist expansion** - kata-kata letterar umum
3. **Timeout pada API fallback** - menghindari hanging UI

### Tingkat Menengah (Medium Impact)
4. **Context-aware suggestions** - meningkatkan kualitas suggestions
5. **Batch processing dengan requestIdleCallback** - smoother typing experience

### Tingkat Rendah (Nice to Have)
6. Expanded literary word coverage dalam dictionary
7. Enhanced stemming untuk morphological variants

## Kesimpulan

Sistem KBBI Notered sudah sangat baik dan production-ready. Optimasi yang dibutuhkan lebih ke arah:

1. **Robustness** - better error handling dan caching
2. **Coverage** - menambahkan kata-kata letterar yang mungkin missing
3. **Performance** - minor optimizations untuk edge cases

Paragraf novel yang diberikan **tidak memerlukan koreksi** - sudah menggunakan bahasa Indonesia yang benar.

## File Yang Akan Dimodifikasi

1. `js/app.js` - _resolveKbbiCrossReference: tambah cache
2. `js/spellcheck.js` - tambah LITERARY_WHITELIST
3. `js/kbbi-api.js` - tambah timeout dan retry
4. `js/autocorrect.js` - context-aware ranking (opsional)
5. `js/stemmer.js` - improved prefix handling (opsional)