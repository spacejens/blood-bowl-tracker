# review-match

`tools/review-match` renders a side-by-side HTML report comparing each import
source's **raw** match data against what the importers actually stored in
`game_data.match_events`. It is a review aid for a human: it cannot decide what
is "correct" on its own, because the interpretation logic it deliberately does
not run is the thing being reviewed.

Scope today is match events; the tool is structured so a future data type
(rosters, standings) plugs in as another module without touching the harness
services.

## What it does

1. Samples matches per source (BBL and TP) across six strata — a few matches
   each, `matchesPerStratum` (default 3) per stratum:
   1. contains a foul
   2. contains a casualty or death
   3. an action paired with a matched consequence
   4. an action *without* a matched consequence
   5. a journeyman, star or mercenary participant
   6. a consequence avoided by apothecary or regeneration (BBL only)
2. Adds every match id listed in `overrides`, whatever the strata picked.
3. For each sampled match, renders two panels:
   - **Raw source** — the BBL mirror page's `table.tblist` rows as plain text,
     or the TP `match_<id>.json`'s `matchEvents[]` entries with their numeric
     codes. Neither panel uses the importers' interpretation logic, so an
     importer bug shows up as a difference instead of being mirrored. TP's raw
     panel also shows a hand-written `(label)` hint next to each numeric code
     — treat the code as the authoritative datum and the label as a reading
     aid only; the label table necessarily describes the same meanings as
     `packages/parse-tp`'s real decoders; it can't independently catch a
     decoder that's simply wrong about what a code means.
   - **Imported** — the `game_data.match_events` rows for that match, with
     players and teams resolved to names.
4. Writes the report under `tools/review-match/output/` (gitignored) with a
   timestamp inserted into the filename (e.g. `report-2026-07-27T19-15-00Z.html`)
   so successive runs don't overwrite each other's reports, and prints where
   it landed.

Strata that match nothing, and override ids that are not in the database, are
reported as gaps in the report (and as console warnings) — never as failures.

## Configuration

Copy the template and edit it:

```bash
cp tools/review-match/review-match-config.example.json5 tools/review-match/review-match-config.json5
```

| Key | Meaning |
| --- | --- |
| `database.url` | Connection string of the database holding the imported data (required) |
| `matchesPerStratum` | Matches sampled per stratum, per source (default 3) |
| `bbl.dataDir` / `tp.dataDir` | The same downloaded data directories `tools/import-bbl` / `tools/import-tp` read |
| `bbl.externalSystemName` / `tp.externalSystemName` | External-system names the imports registered records under (default `BBL` / `TP`) |
| `overrides.bbl` / `overrides.tp` | External match ids always included |
| `outputPath` | Base path each report is written next to, timestamped (default `output/report.html`, e.g. `output/report-2026-07-27T19-15-00Z.html`) |

Relative paths resolve against the working directory, which is
`tools/review-match/` when the tool is run as documented below.

## Running it

The stack must be running and already imported into — see `deploy-local`,
which can also run this tool for you and open the report.

```bash
pnpm --filter @blood-bowl-tracker/review-match run build
( cd tools/review-match && node dist/main.js )
```

Exit codes: `0` with `Reviewed <N> match(es); report written to <path>.` on
success; `1` with `Review failed: <error>` when the database is unreachable or
the config is unusable. Open the path printed on success — each run writes
its own timestamped file under `tools/review-match/output/`, so the most
recent one isn't necessarily named the same as a previous run's.

The tool only reads game data. It does connect through `packages/db`'s
`DbModule`, which applies any pending migrations on connect — against a stack
deployed from the same branch that is a no-op.
