# opnr.gg

Desktop-first TFT comp browser rebuilt with React, TypeScript, and Vite, backed by a normalized local dataset.

## Commands

- `npm install` - install the app, test, and pipeline dependencies
- `npm run launch` - install missing dependencies if needed and launch the app on `127.0.0.1:3002`
- `npm run dev` - start the Vite app
- `npm run build` - typecheck and build the production bundle
- `npm run test` - run unit and component tests
- `npm run data:sync` - fetch and normalize Set 17 TFT inputs into `public/data/tft-set17.json`
- `npm run data:validate` - validate the generated dataset without re-syncing it
- `npm run data:scrape-live` - capture a fresh Mobalytics HTML snapshot into `data/raw/`

## Commit workflow

This repo uses the same Husky commit metadata system as Christmas Lights Studio:

- `pre-commit` runs `npm run typecheck`
- `prepare-commit-msg` appends `[AI: <model> | Machine: <machine>]` to the commit subject
- `commit-msg` rejects commits that do not include that metadata

Set the local defaults once per development machine:

```powershell
git config melty.aiModel "GPT-5 Codex"
git config melty.commitMachine "desktop"
```

Environment variables can override those defaults for one commit: `AI_MODEL`, `CODEX_MODEL`, `AI_COMMIT_MACHINE`, or `CODEX_MACHINE`.

## Portable Launch

From any cloned copy of the repo:

```powershell
npm run launch
```

The launcher is repo-relative and does not depend on local absolute paths. It requires Node 20+, installs missing dependencies with `npm install`, then starts Vite with `--strictPort` on `127.0.0.1:3002`.

Override the target when needed:

```powershell
npm run launch -- --port 3003
npm run launch -- --host 0.0.0.0 --port 3002
npm run launch -- --no-install
```

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
