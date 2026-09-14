# quality4ts

Combined quality dashboard for TypeScript codebases: it runs the sibling tools
(`arch4ts`, `crap4ts`, `dry4ts`), merges their JSON findings into one dataset, and
serves a browsable dashboard — an architecture map with per-module CRAP/DRY badges,
a sortable hotspot table, and drill-to-code with side-by-side duplicate views.

Human inspection tool, not an agent-facing tool. The merged dataset (`quality4ts scan --out report.json`)
is designed as a future CI-gate hook (gate mode itself is deferred).

## Requirements

Node >= 20. Sibling tools must be installed and on PATH (or passed via flags):
[arch4ts](https://github.com/schwammk/arch4ts), [crap4ts](https://github.com/schwammk/crap4ts), [dry4ts](https://github.com/schwammk/dry4ts).

## Install

    git clone git@github.com:schwammk/quality4ts.git
    cd quality4ts
    npm install
    npm link        # optional; or use npx from the repo

## Usage

    quality4ts serve [path] [--port 4174] [--no-open] [--defer-scan]
                    [--max-crap 30] [--dry-threshold 0.82]
                    [--lcov <file>]... [--coverage-command <cmd>] [--use-existing-coverage]
                    [--crap4ts-bin <path>] [--dry4ts-bin <path>] [--arch4ts-bin <path>]

    quality4ts scan [path] --out <file> [same tool/coverage flags]

`serve` scans at startup (unless `--defer-scan`), then serves the dashboard.
`scan` writes the merged JSON dataset headlessly (CI hook).

## What you see

- **Map** — module dependency graph, one rect per module, barycenter-ordered to
  reduce edge crossings. Each leaf module carries a CRAP badge (worst function
  score, colored by band) and a DRY badge (duplicate-pair count). Red names and
  red arrowheads mark cycles; hovering a module dims unconnected edges.
- **Hotspots** — every scanned function sorted by CRAP score, filterable by risk
  band and module.
- **Duplicates** — dry4ts pairs sorted by similarity score, openable side by side.
- Clicking a leaf node in the Map opens the source panel with that file and
  jumps to Hotspots filtered to it; clicking table rows navigates the open
  source panel, highlighting each function's start line.

## Applying it to a new codebase

This captures the learnings of the initial dogfooding session (applied to
quality4ts's own source). Three sibling tools must be present; quality4ts
itself computes nothing — it orchestrates and merges.

### 1. Install the sibling tools

    git clone git@github.com:schwammk/arch4ts.git && cd arch4ts && npm install && npm link && cd ..
    git clone git@github.com:schwammk/crap4ts.git && cd crap4ts && npm install && npm link && cd ..
    git clone git@github.com:schwammk/dry4ts.git && cd dry4ts && npm install && npm link && cd ..

If you skip `npm link`, pass the built CLIs explicitly:
`--crap4ts-bin <repo>/dist/cli.js --dry4ts-bin <repo>/dist/cli.js --arch4ts-bin <repo>/dist/cli.js`.
A missing binary is a hard error naming the flag that fixes it.

Note: crap4ts's JSON must include `startLine`/`endLine` (needed for the merge
key and source highlighting). Cloning current `main` gives you this.

### 2. Coverage in the TARGET project (for real CRAP scores)

Without coverage every CRAP score is `?` (risk band `unknown`). To get scores,
the target needs a vitest coverage setup:

    # in the target project, once:
    npm install --no-save @vitest/coverage-v8@^3   # or add as devDependency

Then point quality4ts at a command that runs the tests AND writes an LCOV file:

    quality4ts serve /path/to/target \
      --coverage-command "npx vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text" \
      --use-existing-coverage --lcov coverage/lcov.info

Session learnings baked into that invocation:

- `--coverage.reporter=lcov` is required — `=text` alone computes coverage but
  never writes the `coverage/lcov.info` file crap4ts reads.
- `--coverage-command` requires at least one `--lcov` (the command produces the
  file; `--lcov` says where it is). `--use-existing-coverage` reads it.
- crap4ts may exit 1 when findings exceed the threshold — that is a *finding*,
  not a failure; quality4ts parses its stdout regardless.
- Without coverage flags, the dashboard still works; CRAP shows `?`.

### 3. Run it

    quality4ts serve /path/to/target --port 4174
    # then open http://127.0.0.1:4174

A full invocation used during dogfooding:

    node dist/cli.js serve . --no-open --port 4174 \
      --crap4ts-bin ../crap4ts/dist/cli.js \
      --dry4ts-bin ../dry4ts/dist/cli.js \
      --arch4ts-bin ../arch4ts/dist/cli.js \
      --coverage-command "npx vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text" \
      --use-existing-coverage --lcov coverage/lcov.info

Headless (CI hook): `quality4ts scan /path/to/target --out report.json [same flags]`
writes the merged dataset; exit 0 always in v1 (gate exit-code mapping deferred).

### What to expect / known edges

- **Attribution**: functions are attributed to map modules via arch4ts's
  module→file mapping, normalized to paths relative to the scan target
  (crap4ts/dry4ts emit absolute paths; quality4ts relativizes them).
- **arch4ts discovery is tsconfig-aware**: it follows the target's root
  tsconfig, so code outside it (e.g. a separate `client/` tsconfig) appears in
  Hotspots but gets no Map badges — it lands in the `unattributed` bucket.
- **Duplicates**: dry4ts defaults are threshold 0.82, `--min-lines 4`,
  `--min-nodes 20`; `--dry-threshold 0.8` will surface near-threshold clones.
- **Re-scan**: `POST /api/scan` (or the Reanalyze button) re-runs all tools.

## Development

    npm test
    npm run build
