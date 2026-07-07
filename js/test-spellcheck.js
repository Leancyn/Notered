/**
 * test-spellcheck.js - Test file for spellchecker improvements
 * 
 * This file can be loaded in the browser to test the spellchecker functionality.
 */

import { SpellChecker } from './spellcheck.js';
import { Dictionary } from './dictionary.js';
import { loadTypoMapFromDictionary } from './typo-from-dictionary.js';
import { checkCommonTypos, generatePhoneticVariants, getCommonTypoMap } from './typo-patterns.js';

// Test cases for common typos
const TEST_CASES = [
  // Common typos
  { input: 'nggak', expected: 'tidak' },
  { input: 'udah', expected: 'sudah' },
  { input: 'blm', expected: 'belum' },
  { input: 'aja', expected: 'saja' },
  { input: 'gini', expected: 'begini' },
  { input: 'gitu', expected: 'begitu' },
  { input: 'gimana', expected: 'bagaimana' },
  { input: 'kayak', expected: 'seperti' },
  { input: 'cuma', expected: 'hanya' },
  { input: 'dgn', expected: 'dengan' },
  { input: 'utk', expected: 'untuk' },
  { input: 'dlm', expected: 'dalam' },
  { input: 'ttg', expected: 'tentang' },
  { input: 'krn', expected: 'karena' },
  
  // Typo patterns
  { input: 'mneulis', expected: 'menulis' },
  { input: 'mnulis', expected: 'menulis' },
  { input: 'ngliat', expected: 'melihat' },
  { input: 'ngeliat', expected: 'melihat' },
  
  // Double letter issues
  { input: 'membacaa', expected: 'membaca' },
  { input: 'menuliss', expected: 'menulis' },
];

async function runTests() {
  console.log('Testing spellchecker improvements...\n');
  
  // Test common typo patterns
  console.log('=== Testing Common Typo Patterns ===');
  for (const test of TEST_CASES) {
    const result = checkCommonTypos(test.input);
    const status = result === test.expected ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: "${test.input}" -> "${result}" (expected: "${test.expected}")`);
  }
  
  // Test phonetic variants
  console.log('\n=== Testing Phonetic Variants ===');
  const phoneticTests = ['mengapa', 'menulis', 'membaca', 'saya'];
  for (const word of phoneticTests) {
    const variants = generatePhoneticVariants(word);
    console.log(`"${word}" -> variants: [${variants.join(', ')}]`);
  }
  
  // Test typo map loading
  console.log('\n=== Testing Typo Map Loading ===');
  try {
    const typoMap = await loadTypoMapFromDictionary('./data/dictionary__JSON.json', { maxEntries: 1000 });
    console.log(`Loaded ${Object.keys(typoMap).length} typo mappings from dictionary`);
    
    // Show some examples
    const examples = Object.entries(typoMap).slice(0, 10);
    console.log('Sample mappings:');
    for (const [from, to] of examples) {
      console.log(`  "${from}" -> "${to}"`);
    }
  } catch (e) {
    console.error('Failed to load typo map:', e);
  }
  
  console.log('\n=== All tests completed ===');
}

// Run tests when loaded
runTests();