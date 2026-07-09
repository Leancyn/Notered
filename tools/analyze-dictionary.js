/**
 * Dictionary Analysis Tool
 * 
 * Analyzes the dictionary__JSON.json structure and extracts:
 * 1. Typo -> Baku mappings (various patterns)
 * 2. Definition formatting issues
 * 3. Word classification (formal/informal)
 * 
 * Run with: node tools/analyze-dictionary.js
 */

const fs = require('fs');
const path = require('path');

const DICTIONARY_PATH = path.join(__dirname, '..', 'data', 'dictionary__JSON.json');

// Load dictionary
function loadDictionary() {
  console.log('📚 Loading dictionary...');
  const data = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf8'));
  const dict = Array.isArray(data?.dictionary) ? data.dictionary : [];
  console.log(`   Loaded ${dict.length} entries`);
  return dict;
}

// Analyze definition format issues
function analyzeDefinitions(dict) {
  console.log('\n🔍 Analyzing definition formats...');
  
  const issues = {
    htmlTags: 0,
    htmlEntities: 0,
    hasQuestionMark: 0,
    hasTidakBaku: 0,
    hasLihat: 0,
    hasBaku: 0,
    emptyDefinitions: 0,
    shortDefinitions: 0,
  };
  
  const samples = {
    htmlTags: [],
    htmlEntities: [],
    hasQuestionMark: [],
    hasTidakBaku: [],
  };
  
  for (const entry of dict) {
    const arti = entry.arti || '';
    
    if (!arti) {
      issues.emptyDefinitions++;
      continue;
    }
    
    if (arti.length < 10) {
      issues.shortDefinitions++;
    }
    
    if (/<[^>]+>/.test(arti)) {
      issues.htmlTags++;
      if (samples.htmlTags.length < 3) samples.htmlTags.push(entry.word);
    }
    
    if (/&[a-z]+;/.test(arti)) {
      issues.htmlEntities++;
      if (samples.htmlEntities.length < 3) samples.htmlEntities.push(entry.word);
    }
    
    if (/\?/.test(arti)) {
      issues.hasQuestionMark++;
      if (samples.hasQuestionMark.length < 3) samples.hasQuestionMark.push({
        word: entry.word,
        arti: arti.substring(0, 100)
      });
    }
    
    if (/tidak\s+baku/i.test(arti)) {
      issues.hasTidakBaku++;
      if (samples.hasTidakBaku.length < 3) samples.hasTidakBaku.push({
        word: entry.word,
        arti: arti.substring(0, 100)
      });
    }
    
    if (/lihat/i.test(arti)) {
      issues.hasLihat++;
    }
    
    if (/baku/i.test(arti)) {
      issues.hasBaku++;
    }
  }
  
  console.log('   Definition Issues:');
  console.log(`   - HTML tags: ${issues.htmlTags}`);
  console.log(`   - HTML entities: ${issues.htmlEntities}`);
  console.log(`   - Contains "?": ${issues.hasQuestionMark}`);
  console.log(`   - Contains "tidak baku": ${issues.hasTidakBaku}`);
  console.log(`   - Contains "lihat": ${issues.hasLihat}`);
  console.log(`   - Contains "baku": ${issues.hasBaku}`);
  console.log(`   - Empty definitions: ${issues.emptyDefinitions}`);
  console.log(`   - Short definitions (<10 chars): ${issues.shortDefinitions}`);
  
  if (samples.htmlTags.length > 0) {
    console.log('\n   Sample HTML tags in definitions:');
    samples.htmlTags.forEach(w => console.log(`   - ${w}`));
  }
  
  if (samples.hasQuestionMark.length > 0) {
    console.log('\n   Sample "?": patterns:');
    samples.hasQuestionMark.forEach(s => {
      console.log(`   - ${s.word}: ${s.arti}...`);
    });
  }
}

// Extract typo mappings with enhanced patterns
function extractTypos(dict) {
  console.log('\n🔍 Extending typo mappings...');
  
  const mappings = {
    questionMark: [],
    tidakBaku: [],
    equalSign: [],
    bentukTidakBaku: [],
    varian: [],
    combined: {},
  };
  
  for (const entry of dict) {
    const word = entry.word || '';
    const arti = entry.arti || '';
    
    if (!word || !arti) continue;
    
    // Pattern 1: "X ? Y" in arti
    const qMatches = arti.match(/([\p{L}\p{M}]+)\s*\?\s*([\p{L}\p{M}]+)/gu);
    if (qMatches) {
      for (const match of qMatches) {
        const parts = match.split('?').map(s => s.trim());
        if (parts.length === 2) {
          mappings.questionMark.push({
            from: parts[0],
            to: parts[1],
            context: arti.substring(0, 80)
          });
        }
      }
    }
    
    // Pattern 2: "tidak baku: X, baku: Y"
    const tbMatch = arti.match(/tidak\s+baku[:\s]+([^,;]+)[,\s]+baku[:\s]+([^;.]+)/i);
    if (tbMatch) {
      mappings.tidakBaku.push({
        from: tbMatch[1].trim(),
        to: tbMatch[2].trim(),
        context: arti.substring(0, 80)
      });
    }
    
    // Pattern 3: "X = Y"
    const eqMatches = arti.match(/([a-z]{3,})\s*=\s*([a-z]{3,})/gi);
    if (eqMatches) {
      for (const match of eqMatches) {
        const parts = match.split('=').map(s => s.trim());
        if (parts.length === 2) {
          mappings.equalSign.push({ from: parts[0], to: parts[1] });
        }
      }
    }
    
    // Pattern 4: Word field contains "X ? Y"
    if (word.includes('?')) {
      const parts = word.split('?').map(s => s.trim());
      if (parts.length === 2 && parts[0].length >= 2 && parts[1].length >= 2) {
        mappings.questionMark.push({
          from: parts[0],
          to: parts[1],
          fromWord: true
        });
      }
    }
  }
  
  console.log(`   Found ${mappings.questionMark.length} "?" patterns`);
  console.log(`   Found ${mappings.tidakBaku.length} "tidak baku" patterns`);
  console.log(`   Found ${mappings.equalSign.length} "=" patterns`);
  
  // Sample outputs
  console.log('\n   Sample "?" mappings:');
  mappings.questionMark.slice(0, 5).forEach(m => {
    console.log(`   - ${m.from} → ${m.to}`);
  });
  
  console.log('\n   Sample "tidak baku" mappings:');
  mappings.tidakBaku.slice(0, 5).forEach(m => {
    console.log(`   - ${m.from} → ${m.to}`);
  });
  
  return mappings;
}

// Analyze word types
function analyzeWordTypes(dict) {
  console.log('\n🔍 Analyzing word types...');
  
  const types = {};
  const wordsByType = {};
  
  for (const entry of dict) {
    const type = entry.type || 'unknown';
    types[type] = (types[type] || 0) + 1;
    
    if (!wordsByType[type]) {
      wordsByType[type] = [];
    }
    if (wordsByType[type].length < 3) {
      wordsByType[type].push(entry.word);
    }
  }
  
  console.log('   Word types distribution:');
  for (const [type, count] of Object.entries(types)) {
    console.log(`   - ${type}: ${count}`);
  }
}

// Main analysis
function main() {
  console.log('=== KBBI Dictionary Analysis Tool ===\n');
  
  const dict = loadDictionary();
  analyzeDefinitions(dict);
  const typoMappings = extractTypos(dict);
  analyzeWordTypes(dict);
  
  console.log('\n✅ Analysis complete!');
  
  // Summary
  console.log('\n📊 Recommendations:');
  console.log('   1. Update typo-from-dictionary.js to handle all patterns found');
  console.log('   2. Clean HTML entities in definitions during validation');
  console.log('   3. Add proper formal/informal classification');
}

// Run
if (require.main === module) {
  main();
}

module.exports = { loadDictionary, extractTypos, analyzeDefinitions };