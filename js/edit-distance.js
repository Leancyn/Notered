/**
 * edit-distance.js - Edit distance algorithms
 *
 * Provides:
 * - levenshteinDistance(a,b)
 * - damerauLevenshteinDistance(a,b) (Optimal String Alignment variant)
 *
 * Note: OSA variant handles single transpositions and is fast for short strings.
 */

export function levenshteinDistance(a, b) {
  a = (a ?? "").toLowerCase();
  b = (b ?? "").toLowerCase();

  if (a === b) return 0;
  const n = a.length;
  const m = b.length;

  if (n === 0) return m;
  if (m === 0) return n;

  // Use two rows to reduce memory
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);

    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = Math.min(del, ins, sub);
    }

    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[m];
}

/**
 * Damerau-Levenshtein distance (Optimal String Alignment variant).
 * Allows transposition of two adjacent characters.
 */
export function damerauLevenshteinDistance(a, b) {
  a = (a ?? "").toLowerCase();
  b = (b ?? "").toLowerCase();

  if (a === b) return 0;

  const n = a.length;
  const m = b.length;

  if (n === 0) return m;
  if (m === 0) return n;

  // Create DP matrix with (n+1) x (m+1)
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;

      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      const sub = dp[i - 1][j - 1] + cost;

      let val = Math.min(del, ins, sub);

      // Transposition (adjacent swap)
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }

      dp[i][j] = val;
    }
  }

  return dp[n][m];
}
