# import-tp

`tools/import-tp/` is the discovery/dry-run scaffold for importing data from
TP (thebiggerbowl / TabletopPlaying) into the tracker. The source data is a set
of JSON API responses, laid out as one subdirectory per era, with a
per-competition subdirectory inside each era (e.g.
`data/fourth-era/tloegbbl-chaos-cup-8/`). Unlike BBL's HTML mirror, TP's files
are JSON.

At this stage the tool performs **no import** — it walks the configured data
directories and prints a per-era summary of how many competitions and files of
each type it found. Actual JSON parsing and entity import land in later
sub-issues (#193-198), with reusable parsing logic in `packages/parse-tp`.

## Configuration

Configuration is supplied through a JSON5 file, `import-tp-config.json5`, in the
tool directory (`tools/import-tp/`). JSON5 allows comments and trailing commas,
so the era list can be documented inline. Top-level keys:

- `connection` — runtime settings for reaching the api-server to import into.
  The group itself is required (mirroring `import-bbl-config.json5`), even
  though its only current field is optional.
  - `apiBaseUrl` — base URL of the running api-server. Defaults to
    `http://localhost:3000` if unset.
- `dataDir` — path to the folder that directly contains one subdirectory per
  era. This is a subfolder of the git-ignored `data/` directory. A relative
  path resolves against the current working directory.
- `eras` — a JSON array mapping each era to its data subdirectory:
  - `name` — the era's display name in the database.
  - `dataSubdir` — the subdirectory under `dataDir` holding that era's TP
    files. TP's subdirectory names are its own slugs and don't necessarily
    match the era's display name. Every `name` and every `dataSubdir` must be
    unique across the array.

## Data layout

The tool expects, under `dataDir`:

```
<dataDir>/
  <era.dataSubdir>/
    <competition>/
      match_<id>.json
      rosters_<id>.json
      tournament_<slug>.json
      tournament_<slug>_coach-stats.json
      awards_<slug>_awards.json
      ...
```

Each file's "type" is the filename text before the first `_` (or the whole
basename when there is no `_`) — e.g. `match`, `rosters`, `tournament`,
`awards`, `inscriptions`.

## Run it

1. Copy the template and fill in real values:
   ```bash
   cp tools/import-tp/import-tp-config.example.json5 tools/import-tp/import-tp-config.json5
   ```
   `tools/import-tp/import-tp-config.json5` is git-ignored, so your
   configuration is never committed.
2. Run the discovery script from the `tools/import-tp/` directory so the config
   file is picked up automatically:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-tp run start
   ```
   (Run `pnpm --filter @blood-bowl-tracker/import-tp run build` first, since
   `start` runs the compiled `dist/main.js`.)

   It prints one line per era, e.g.:
   ```
   Fourth era: 3 competitions, 42 files (match: 12, rosters: 9, tournament: 15, awards: 3, inscriptions: 3)
   ```

## Architecture

- **ImportTpConfigService** — loads `import-tp-config.json5` (JSON5), exposing
  raw top-level values via `get<T>(key)` and the api-server base URL via
  `getApiBaseUrl()`. A missing file is treated as empty so each getter throws
  its own friendly error.
- **EraDataConfigService** — reads the `eras` array into `{ name, dataSubdir }`
  entries, validating both fields and enforcing unique names and subdirs.
- **SourceModule** — the reusable traversal core. `SourceConfigService`
  resolves `dataDir` against the current working directory; `TpSourceReader`
  walks `<dataDir>/<era>/<competition>/*.json` and streams one `TpSourceFile`
  per file (era name, competition, type, filename, JSON-parsed content),
  keeping only one file in memory at a time. This is the pattern future
  data-type extractors reuse.

Reusable TP JSON-parsing logic will live in `packages/parse-tp`, so it can be
shared between `tools/import-tp` and `apps/discord-bot`. That package is an
empty skeleton until #193.
