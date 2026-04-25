# TFT Early Game Viewer

Desktop-first TFT comp browser rebuilt with React, TypeScript, and Vite, backed by a normalized local dataset.

## Commands

- `npm install` - install the app, test, and pipeline dependencies
- `npm run dev` - start the Vite app
- `npm run build` - typecheck and build the production bundle
- `npm run test` - run unit and component tests
- `npm run data:sync` - fetch and normalize Set 17 TFT inputs into `public/data/tft-set17.json`
- `npm run data:validate` - validate the generated dataset without re-syncing it
- `npm run data:scrape-live` - capture a fresh Mobalytics HTML snapshot into `data/raw/`

## Repo shape

- `src/` - React app
- `shared/` - shared types, schemas, and normalization helpers
- `scripts/` - TypeScript pipeline and dataset validation
- `public/data/` - generated runtime dataset
- `public/assets/` - local runtime assets
- `data/raw/` - raw source inputs and snapshots
- `tests/` - Vitest coverage
- `legacy/` - archived pre-rewrite scripts and dumps

## Notes

- The runtime app reads one canonical dataset: `public/data/tft-set17.json`.
- The current `data:sync` flow pulls Set 17 comp signals from TFTAcademy, Mobalytics, TFTactics, TFTFlow, and MetaTFT, then fills missing phase and guide fields into one normalized shape.
- The live scrape command intentionally captures source HTML only; the normalization pipeline remains the source of truth for the app bundle.
