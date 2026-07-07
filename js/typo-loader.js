/**
 * typo-loader2.js
 *
 * Unified typo map loader:
 * - Primarily extracts typo->baku mapping from dictionary__JSON.json dataset.
 * - Falls back to data/typo.json if extraction yields nothing.
 */

import { loadTypoMapFromDictionary } from "./typo-from-dictionary.js";
import { getCachedTypoMap, setCachedTypoMap } from "./typo-cache.js";

const DEFAULT_LOCAL_DICT_URL = "./data/dictionary__JSON.json";
const EXTRACTED_TYPOS_URL = "./data/extracted_typos.json";

async function loadTypoMap(url) {
  const res = await fetch(url);
  if (!res.ok) return {};
  return await res.json();
}

export async function loadTypoMapUnified({ dictionaryUrl = DEFAULT_LOCAL_DICT_URL, fallbackUrl = "./data/typo.json", extractionMaxEntries = 0 } = {}) {
  // 1) try cache
  // Invalidate cache automatically if extractor logic changes by bumping a local version marker.
  const extractorVersion = 3;
  const cached = await getCachedTypoMap({ dictUrl: dictionaryUrl, extractionMaxEntries, extractorVersion });
  if (cached && Object.keys(cached).length > 0) return cached;

  // 2) try extract from dictionary
  const extracted = await loadTypoMapFromDictionary(dictionaryUrl, { maxEntries: extractionMaxEntries });
  if (extracted && Object.keys(extracted).length > 0) {
    await setCachedTypoMap(extracted, { dictUrl: dictionaryUrl, extractionMaxEntries });
    return extracted;
  }

  // 3) fallback to extracted typos file
  const extractedTypos = await loadTypoMap(EXTRACTED_TYPOS_URL);
  if (extractedTypos && Object.keys(extractedTypos).length > 0) {
    await setCachedTypoMap(extractedTypos, { dictUrl: dictionaryUrl, extractionMaxEntries });
    return extractedTypos;
  }

  // 4) fallback to static typo.json (also cache)
  const fallback = await loadTypoMap(fallbackUrl);
  if (fallback && Object.keys(fallback).length > 0) {
    await setCachedTypoMap(fallback, { dictUrl: dictionaryUrl, extractionMaxEntries });
  }
  return fallback;
}
