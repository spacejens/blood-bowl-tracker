# import-tp

`tools/import-tp/` imports data from TP (thebiggerbowl / TabletopPlaying) into
the tracker. The source data is a set of JSON API responses, laid out as one
subdirectory per era, with a per-competition subdirectory inside each era
(e.g. `data/fourth-era/tloegbbl-chaos-cup-8/`). Unlike BBL's HTML mirror, TP's
files are JSON.

At this stage the tool imports **the league, its rule sets, and its eras**.
Competitions, matches, coaches, and the rest of the entity graph land in later
sub-issues (#194-198), with reusable parsing logic in `packages/parse-tp`.

## Configuration

Configuration is supplied through a JSON5 file, `import-tp-config.json5`, in the
tool directory (`tools/import-tp/`). JSON5 allows comments and trailing commas,
so the era list can be documented inline. Top-level keys:

- `connection` — runtime settings for reaching the api-server to import into.
  The group itself is required (mirroring `import-bbl-config.json5`), even
  though its only current field is optional.
  - `apiBaseUrl` — base URL of the running api-server. Defaults to
    `http://localhost:3000` if unset.
- `externalSystemName` — name of the external system TP records are
  registered under. Defaults to `"TP"` if unset or empty.
- `dataDir` — path to the folder that directly contains one subdirectory per
  era. This is a subfolder of the git-ignored `data/` directory. A relative
  path resolves against the current working directory.
- `league` — everything that describes the league being imported: its name
  and the eras it played through. Rule sets and eras are not present in TP's
  data (only an opaque numeric rule-set code is), so they are supplied here,
  same as `import-bbl-config.json5`.
  - `name` — the league's display name. Used as the league's external ID
    under both the TP and Name external systems.
  - `eras` — an array mapping each era to its data subdirectory and rule
    sets:
    - `identity.name` — the era's display name in the database.
    - `identity.rulesSets` — a non-empty array of rule-set names the era
      spans, in chronological order.
    - `dates.startDate` — the era's start date (required, `YYYY-MM-DD`).
    - `dates.endDate` — the era's end date (optional; omit for an era still
      ongoing).
    - `dataSubdir` — the subdirectory under `dataDir` holding that era's TP
      files. TP's subdirectory names are its own slugs and don't necessarily
      match the era's display name. Every `identity.name` and every
      `dataSubdir` must be unique across the array.

Example, taken from `import-tp-config.example.json5`:

```json5
{
  connection: {
    apiBaseUrl: 'http://localhost:3000',
  },
  externalSystemName: 'TP',
  dataDir: 'data',
  league: {
    name: 'tLoEGBBL',
    eras: [
      {
        identity: {
          name: 'Third era',
          rulesSets: ['LRB6'],
        },
        dates: {
          startDate: '2013-01-01',
          endDate: '2016-12-31',
        },
        dataSubdir: 'third-era',
      },
      {
        identity: {
          name: 'Second Dungeon Bowl era',
          rulesSets: ['Dungeon Bowl 2021'],
        },
        dates: {
          startDate: '2021-01-01',
          endDate: '2021-12-31',
        },
        dataSubdir: 'second-dungeon-bowl-era',
      },
      {
        identity: {
          name: 'Fourth era',
          rulesSets: ['BB2020'],
        },
        dates: {
          startDate: '2020-11-28',
        },
        dataSubdir: 'fourth-era',
      },
    ],
  },
}
```

Rule-set names and era dates are config-supplied because TP's data carries
only an opaque numeric rule-set code, not a name or a date range. The tool
still reads that code out of each era's data files and cross-checks it's
consistent within the era directory — a diagnostic that catches data
misplaced under the wrong era subdirectory, not a source of truth for naming.

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
2. Build and run the tool so the config file is picked up automatically:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-tp run build
   pnpm --filter @blood-bowl-tracker/import-tp run start
   ```
   This performs a real import against a running api-server (see
   `connection.apiBaseUrl`). Sample success output:
   ```
   Imported 5 record(s) successfully.
   ```
   On failure, the tool exits with a non-zero status and prints each error.

## Architecture

- **ImportTpConfigService** — loads `import-tp-config.json5` (JSON5), exposing
  raw top-level values via `get<T>(key)` and the api-server base URL via
  `getApiBaseUrl()`. A missing file is treated as empty so each getter throws
  its own friendly error.
- **ExternalSystemNameConfigService** — resolves the `externalSystemName`
  config key, defaulting to `"TP"`.
- **LeagueConfigService** — reads the `league.name` config key.
- **EraDataConfigService** — reads the `league.eras` array into structured
  entries (`identity`, `dates`, `dataSubdir`), validating each field and
  enforcing unique era names and data subdirectories.
- **SourceModule** — the reusable traversal core. `SourceConfigService`
  resolves `dataDir` against the current working directory; `TpSourceReader`
  walks `<dataDir>/<era>/<competition>/*.json` and streams one `TpSourceFile`
  per file (era name, competition, type, filename, JSON-parsed content),
  keeping only one file in memory at a time. This is the pattern future
  data-type extractors reuse.
- **TpLeaguesImportService** — upserts the league from `league.name`, under
  both the TP and Name external systems.
- **TpRulesSetsImportService** — upserts the rule sets named across
  `league.eras[].identity.rulesSets`.
- **TpErasImportService** — upserts each configured era, linking it to the
  league and its rule sets. Also cross-checks TP's numeric rule-set code for
  consistency within each era's data directory, using `parseTournament` from
  `packages/parse-tp`.

`main.ts` orchestrates these in dependency order — league, then rule sets,
then eras — aggregating each step's `ImportResult` into one overall result,
mirroring `tools/import-bbl/src/main.ts`.
