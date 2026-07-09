# Notered Project Structure

## Directory Structure

```
Notered/
├── index.html              # Main entry point
├── README.md               # Project documentation
├── css/                    # Stylesheets
│   ├── index.css           # Design system & reset
│   ├── components.css      # Shared UI components
│   ├── editor.css          # Text editor styles
│   ├── sketch.css          # Sketch reference module styles
│   ├── animations.css      # Animation keyframes & utilities
│   ├── mood.css            # Mood tracker styles
│   └── challenge.css       # Challenge feature styles
├── js/                     # JavaScript modules
│   ├── app.js              # Main application entry point
│   ├── ui.js               # UI controller (modals, tabs, toasts)
│   ├── dictionary.js       # KBBI dictionary engine
│   ├── spellcheck.js       # Spell checker & suggestion engine
│   ├── editor.js           # Text editor module
│   ├── sketch.js           # Sketch reference module
│   ├── sketch-worker.js    # Web worker for sketch processing
│   ├── storage.js          # LocalStorage persistence manager
│   ├── export.js           # File export & sharing utilities
│   ├── kbbi-api.js         # KBBI definition lookup API
│   ├── kbbi-validator.js   # KBBI data validator
│   ├── kbbi-parser.js      # KBBI definition parser & formatter
│   ├── autocorrect.js      # Autocorrect candidate generation
│   ├── stemmer.js          # Indonesian word stemmer
│   ├── edit-distance.js    # Edit distance algorithms
│   ├── typo-patterns.js    # Typo pattern library
│   ├── typo-loader.js      # Typo map loader
│   ├── typo-from-dictionary.js # Extract typos from dictionary
│   ├── typo-cache.js       # IndexedDB typo caching
│   ├── mood-tracker.js     # Daily mood tracker & journal prompts
│   ├── challenge.js        # Random daily challenges
│   └── puebi-normalize.js  # Text normalization utilities
├── data/                   # Data files
│   ├── dictionary__JSON.json   # KBBI dictionary dataset (85k+ entries)
│   └── extracted_typos.json    # Extracted typo mappings
└── docs/                   # Documentation
    ├── INDONESIAN_LANGUAGE_ANALYSIS.md
    └── KBBI_OPTIMIZATION_ANALYSIS.md
```

## Dependency Graph

```
index.html
    └── js/app.js
            ├── js/ui.js
            ├── js/dictionary.js
            │       └── js/kbbi-validator.js
            ├── js/spellcheck.js
            │       ├── js/stemmer.js
            │       ├── js/autocorrect.js
            │       │       ├── js/edit-distance.js
            │       │       └── js/typo-patterns.js
            │       └── js/typo-loader.js
            │               ├── js/typo-from-dictionary.js
            │               └── js/typo-cache.js
            ├── js/editor.js
            │       ├── js/spellcheck.js
            │       └── js/storage.js
            │       └── js/puebi-normalize.js
            ├── js/sketch.js
            │       ├── js/storage.js
            │       └── js/sketch-worker.js
            ├── js/storage.js
            ├── js/export.js
            ├── js/kbbi-api.js
            │       ├── js/kbbi-validator.js
            │       └── js/kbbi-parser.js
            ├── js/mood-tracker.js
            └── js/challenge.js
```
