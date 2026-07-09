/**
 * typo-from-dictionary.js
 *
 * Extract typo -> baku mapping from local dictionary dataset.
 *
 * Current dataset format (data/dictionary__JSON.json and GitHub RAW):
 * {
 *   "dictionary": [ { _id, word, arti, type }, ... ]
 * }
 *
 * Notes:
 * - The dataset contains many entries where `arti` includes patterns like
 *   "X ? Y" meaning X is an alternative/variant, and Y is the baku form.
 * - It also contains "?" markers in word/arti fields.
 *
 * This extractor focuses on:
 *  1) `arti` patterns: "<from> ? <to>" (common in entries: "abimana ? abaimana")
 *  2) Additionally, if `word` itself contains " ? " patterns, it is parsed.
 *
 * Output format:
 *  { [typoLower]: bakuLower }
 */

const DEFAULT_DICTIONARY_URL = "./data/dictionary__JSON.json";

/**
 * Decode HTML entities (needed for proper pattern matching)
 */
function _decodeHtmlEntities(str) {
  const e = '&';
  return str
    .replace(new RegExp(e + 'nbsp;', 'g'), ' ')
    .replace(new RegExp(e + 'lt;', 'g'), '<')
    .replace(new RegExp(e + 'gt;', 'g'), '>')
    .replace(new RegExp(e + 'quot;', 'g'), '"')
    .replace(new RegExp(e + 'apos;', 'g'), "'")
    .replace(new RegExp(e + '#39;', 'g'), "'")
    .replace(new RegExp(e + 'amp;', 'g'), '&')
    .replace(/#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function normalizeWord(w) {
  return (
    (w ?? "")
      .toString()
      .trim()
      .toLowerCase()
      // drop trailing/leading punctuation commonly present in snippets
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .replace(/\s+/g, " ")
  );
}

function isValidPair(from, to) {
  if (!from || !to) return false;
  if (from === to) return false;
  // avoid very short garbage tokens
  if (from.length < 2 || to.length < 2) return false;

  // Avoid pairing cases that are very likely not typo->baku.
  // Many entries encode other marker formats inside "arti".
  // If either side contains digits or is a single letter fragment, skip.
  if (/\d/.test(from) || /\d/.test(to)) return false;
  if (from.length <= 2 && from.length !== to.length) return false;

  // Skip obvious abbreviations / tokens that don't look like Indonesian words.
  // Allow hyphenated words; block punctuation except hyphen.
  const tokenRe = /^[\p{L}]+(?:-[\p{L}]+)*$/u;
  if (!tokenRe.test(from) || !tokenRe.test(to)) return false;

  // Skip common HTML tag remnants that might appear as "to" value
  // (e.g., "br" from <br> being parsed as typo target)
  const skipValues = ["br", "gt", "lt", "amp", "quot", "apos", "nbsp"];
  if (skipValues.includes(to.toLowerCase())) return false;

  return true;
}

/**
 * Check if a pair looks like a valid word variant/correction relationship.
 * More permissive than before to include informal->formal mappings.
 */
function isLikelyTypoPair(from, to) {
  // Allow pairs even with larger edit distance since informal->formal
  // mappings can differ significantly (e.g. "nggak" -> "tidak", dist=5).
  // We still filter out pairs that are obviously unrelated.
  const dist = levenshteinDistance(from, to);
  if (dist > 8) return false;

  // Allow meaningful length difference for abbreviations/slang
  if (Math.abs(from.length - to.length) > 10) return false;

  // Heuristic: if one starts with the other, it's likely a valid relationship
  const prefixMatch = to.startsWith(from.slice(0, 2)) || from.startsWith(to.slice(0, 2));
  if (!prefixMatch && dist > 4) return false;

  return true;
}

/**
 * Simple Levenshtein distance for filtering
 */
function levenshteinDistance(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[n][m];
}

/**
 * Extract mapping candidates from a dictionary entry.
 * @param {{word?:string, arti?:string, type?:number}} entry
 * @returns {Array<{from:string,to:string}>}
 */
function extractPairsFromEntry(entry) {
  const out = [];
  const word = entry?.word ?? "";
  const arti = entry?.arti ?? "";

  // Case 1: sometimes the word field contains "X ? Y"
  // e.g. "abimana ? abaimana" (observed in arti snippets too)
  const wordQPairs = (word || "").split("?");
  if (wordQPairs.length === 2) {
    const from = normalizeWord(wordQPairs[0]);
    const to = normalizeWord(wordQPairs[1]);
    if (isValidPair(from, to) && isLikelyTypoPair(from, to)) {
      out.push({ from, to });
    }
  }

  // Case 2: parse `arti` for "something ? something"
  // Pattern 2a: "X ? Y" - variant forms
  // Pattern 2b: "X tidak baku, Y baku" or "X = Y" patterns
  const plain = arti ? arti.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ") : "";

  // Pattern 2a: "X ? Y" variant relationships
  const reQuestion = /([^\s;,.()\[\]{}<>]{2,})\s*\?\s*([^\s;,.()\[\]{}<>]{2,})/g;
  let m;
  while ((m = reQuestion.exec(plain))) {
    const fromRaw = m[1];
    const toRaw = m[2];
    const from = normalizeWord(fromRaw.replace(/[\u00B7·]/g, ""));
    const to = normalizeWord(toRaw.replace(/[\u00B7·]/g, ""));
    if (isValidPair(from, to) && isLikelyTypoPair(from, to)) {
      out.push({ from, to });
    }
  }

  // Pattern 2b: "tidak baku" / "baku" markers - capture informal to formal mappings
  // Examples: "tidak baku: X, baku: Y" or similar patterns
  const reTidakBaku = /tidak\s+baku[:\s]+([^\s;,.()<>]{2,})[,\s]+baku[:\s]+([^\s;,.()<>]{2,})/gi;
  while ((m = reTidakBaku.exec(plain))) {
    const from = normalizeWord(m[1]);
    const to = normalizeWord(m[2]);
    if (isValidPair(from, to) && isLikelyTypoPair(from, to)) {
      out.push({ from, to });
    }
  }

  // Pattern 2c: "X = Y" equality patterns
  const reEqual = /([a-z]{3,})\s*=\s*([a-z]{3,})/gi;
  while ((m = reEqual.exec(plain))) {
    const from = normalizeWord(m[1]);
    const to = normalizeWord(m[2]);
    if (isValidPair(from, to) && isLikelyTypoPair(from, to)) {
      out.push({ from, to });
    }
  }

  // Pattern 2d: "Lihat: X" -> X refers to the canonical form
  const reLihat = /lihat[:\s]+([\p{L}]{2,})/gi;
  while ((m = reLihat.exec(plain))) {
    // For "Lihat" patterns, the current word might be a variant of the referenced word
    // We skip direct extraction here since it requires context.
    // The cross-reference resolution is handled in _resolveKbbiCrossReference.
  }

  // Pattern 2e: "bentuk tidak baku: X" or "tidak baku: X" followed by a formal word
  const reBentukTidakBaku = /bentuk\s+tidak\s+baku[:\s]+([\p{L}]{2,})/gi;
  while ((m = reBentukTidakBaku.exec(plain))) {
    const informal = normalizeWord(m[1]);
    // We can't determine the formal form from this pattern alone,
    // but we can mark it if the current `word` entry itself is the formal form
    if (word && word !== informal && isValidPair(informal, word.toLowerCase()) && isLikelyTypoPair(informal, word.toLowerCase())) {
      out.push({ from: informal, to: word.toLowerCase() });
    }
  }

  // Pattern 2f: "varian dari: X" or "varian: X"
  const reVarian = /varian\s+(?:dari\s+)?[:\s]+([\p{L}]{2,})/gi;
  while ((m = reVarian.exec(plain))) {
    const from = normalizeWord(m[1]);
    if (word && word !== from && isValidPair(from, word.toLowerCase()) && isLikelyTypoPair(from, word.toLowerCase())) {
      out.push({ from, to: word.toLowerCase() });
    }
  }

  return out;
}

/**
 * Load and extract typo mapping.
 * @param {string} [url]
 * @param {object} [opts]
 * @param {number} [opts.maxEntries] - safety cap during extraction
 * @returns {Promise<Record<string,string>>}
 */
export async function loadTypoMapFromDictionary(url = DEFAULT_DICTIONARY_URL, opts = {}) {
  const maxEntries = opts.maxEntries ?? 0; // 0 => no cap

  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();

    const dict = Array.isArray(data?.dictionary)
      ? data.dictionary
      : Array.isArray(data)
        ? data
        : // some variants might store entries directly under a different key
          Array.isArray(data?.kbbi)
          ? data.kbbi
          : [];

    if (!dict || !dict.length) return {};

    const map = Object.create(null);

    const limit = maxEntries > 0 ? Math.min(maxEntries, dict.length) : dict.length;
    for (let i = 0; i < limit; i++) {
      const entry = dict[i];
      const pairs = extractPairsFromEntry(entry);
      for (const p of pairs) {
        // Prefer the first observed mapping only.
        if (!map[p.from]) map[p.from] = p.to;
      }
    }

    return map;
  } catch {
    return {};
  }
}
