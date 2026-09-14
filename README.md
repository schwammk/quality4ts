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
- Clicking a module or function opens the source, highlighted at the relevant line.

## Development

    npm test
    npm run build
