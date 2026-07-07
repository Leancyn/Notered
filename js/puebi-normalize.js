/**
 * puebi-normalize.js
 *
 * Lightweight normalizer for common, deterministic PUEBI-related typography
 * that affects tokenization (spaces around punctuation) and word-level
 * checks (capitalization).
 *
 * This is intentionally conservative to avoid creating false positives.
 */

export function normalizeForSpellcheck(text) {
  if (typeof text !== "string") return "";

  let out = text;

  // Normalize whitespace around punctuation: no space before , . ! ? : ;
  // Keep after punctuation as a single space (or newline).
  out = out
    // remove spaces before punctuation
    .replace(/\s+([,.;:!?])/g, "$1")
    // ensure single space after punctuation if followed by a letter
    .replace(/([,.;:!?])([\p{L}])/gu, "$1 $2");

  // Normalize quotes/brackets spacing (basic)
  out = out.replace(/\s+(["'”’\)\]\}])/g, "$1").replace(/([\(\[\{“‘])\s+/g, "$1");

  // Capitalization: capitalize first letter after sentence boundary
  // (., !, ?) followed by whitespace/newline and a lowercase letter.
  out = out.replace(/(^|[.!?]\s+)([\p{L}])/gu, (m, p1, p2) => {
    return p1 + p2.toLocaleUpperCase();
  });

  return out;
}
