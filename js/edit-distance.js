/**
 * edit-distance.js - High-performance edit distance algorithms
 *
 * Optimizations:
 * - Int16Array row buffers for cache-friendly memory layout
 * - Early-exit via row-minimum bound check (bounded variant)
 * - Reusable global buffers to eliminate GC pressure on hot paths
 */

// Reusable row buffers (max word length 128 chars expected)
const _MAX_LEN = 256;
const _prevBuf = new Int16Array(_MAX_LEN + 1);
const _currBuf = new Int16Array(_MAX_LEN + 1);

/**
 * Standard Levenshtein Distance — O(n·m) time, O(min(n,m)) space.
 * Uses typed arrays for reduced GC pressure.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  a = (a ?? "").toLowerCase();
  b = (b ?? "").toLowerCase();

  if (a === b) return 0;

  let n = a.length;
  let m = b.length;

  if (n === 0) return m;
  if (m === 0) return n;

  // Ensure b is the shorter string for minimal memory
  if (n < m) {
    const tmp = a; a = b; b = tmp;
    const t = n; n = m; m = t;
  }

  // Use static buffers if within size, else fallback to dynamic
  const prev = m <= _MAX_LEN ? _prevBuf : new Int16Array(m + 1);
  const curr = m <= _MAX_LEN ? _currBuf : new Int16Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    // Swap rows
    prev.set(curr.subarray(0, m + 1));
  }

  return prev[m];
}

/**
 * Damerau-Levenshtein distance (Optimal String Alignment variant).
 * Handles transpositions of adjacent characters in addition to L ops.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function damerauLevenshteinDistance(a, b) {
  a = (a ?? "").toLowerCase();
  b = (b ?? "").toLowerCase();

  if (a === b) return 0;

  const n = a.length;
  const m = b.length;

  if (n === 0) return m;
  if (m === 0) return n;

  // Full 2D DP — only used when transposition history is needed
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);

      if (i > 1 && j > 1 &&
          a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
          a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }

  return dp[n][m];
}

/**
 * Bounded Damerau-Levenshtein — returns maxDistance+1 immediately when
 * the current row minimum already exceeds the bound.
 *
 * This is the CRITICAL hot-path function used by autocorrect candidate scoring.
 * It avoids allocating full DP matrices and exits early.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} maxDistance
 * @returns {number}
 */
export function boundedDamerauLevenshteinDistance(a, b, maxDistance = 2) {
  a = (a ?? "").toLowerCase();
  b = (b ?? "").toLowerCase();

  if (a === b) return 0;

  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > maxDistance) return maxDistance + 1;

  const n = a.length;
  const m = b.length;

  if (n === 0) return m <= maxDistance ? m : maxDistance + 1;
  if (m === 0) return n <= maxDistance ? n : maxDistance + 1;

  // Allocate three rolling rows. Keep static buffers when possible.
  const size = m + 1;
  let rowPP = new Int16Array(size);
  let rowP  = new Int16Array(size);
  let rowC  = new Int16Array(size);

  for (let j = 0; j <= m; j++) rowP[j] = j;

  for (let i = 1; i <= n; i++) {
    rowC[0] = i;
    let rowMin = rowC[0];
    const ai = a.charCodeAt(i - 1);

    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let val = Math.min(rowP[j] + 1, rowC[j - 1] + 1, rowP[j - 1] + cost);

      if (i > 1 && j > 1 &&
          ai === b.charCodeAt(j - 2) &&
          a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        val = Math.min(val, rowPP[j - 2] + 1);
      }

      rowC[j] = val;
      if (val < rowMin) rowMin = val;
    }

    // Early exit: entire row exceeds budget
    if (rowMin > maxDistance) return maxDistance + 1;

    // Roll rows
    const tmp = rowPP;
    rowPP = rowP;
    rowP  = rowC;
    rowC  = tmp;
  }

  return rowP[m] <= maxDistance ? rowP[m] : maxDistance + 1;
}
