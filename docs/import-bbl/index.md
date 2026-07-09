# import-bbl

`tools/import-bbl/` imports data from the BBL league website into the tracker
via the API. The source data is a `wget` mirror: a folder of HTML pages named
`default.asp?p=<type>&<params>`, encoded ISO-8859-1.

## Configuration

Configuration is supplied through environment variables — an `.env` file in the
tool directory, or exported in your shell:

- `BBL_DATA_DIR` — path to the folder that directly contains the
  `default.asp?p=...` files. This is a subfolder of the git-ignored `data/`
  directory (each `wget` download lands in its own subfolder). A relative path
  resolves against the current working directory. Ask the developer for the
  download if you don't have it.
- `BBL_LEAGUE_NAME` — the name of the league the BBL data covers. The BBL data
  mirror covers a single league whose name is not present in the data, so it is
  supplied here. Used as the league's external ID under both the `BBL` and
  `Name` external systems.
- `API_BASE_URL` — base URL of the running api-server to import into. Defaults
  to `http://localhost:3000` (a local docker-compose deployment) if unset.

## Run it

1. Copy the template and fill in real values:
   ```bash
   cp tools/import-bbl/.env.example tools/import-bbl/.env
   ```
   `tools/import-bbl/.env` is git-ignored, so your configuration is never
   committed.
2. Run the tool from the `tools/import-bbl/` directory so the `.env` is picked
   up automatically:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-bbl run start
   ```

## Architecture

- **SourceModule** — reusable, data-type-agnostic core. `BblSourceReader`
  walks the data folder, classifies files by page type (`p=` param), decodes
  ISO-8859-1, and streams pages one at a time (`pages(type)`), keeping memory
  bounded. This is the pattern future data types reuse.
- **CoachesModule** — first data-type extractor. `CoachPageParser` reads a
  coach from a team page; `BblCoachesImportService` streams team pages,
  deduplicates coaches by exact name, and upserts each through the API.
- **RacesModule** — data-type extractor for races. `RacePageParser` reads a
  race from a team page; `BblRacesImportService` streams team pages
  (independently of the coaches walk), deduplicates races by exact name, and
  upserts each through the API.

API calls go through `packages/import` — the shared import services that other
`tools/import-*` tools reuse — which in turn call the API through
`packages/api-client`. No tool talks to the API directly.

Imports are close to idempotent, but not exactly: re-running never creates
duplicates (records are matched by their external IDs), yet the same import can
still change the database. For example, another tool may have altered the
underlying data since the last run, or import-bbl may have been improved to
extract more than before — in which case existing records are updated.
Re-running is always safe and fills any gaps left by transient failures.

## Data types

- **Leagues** — a single league from the `BBL_LEAGUE_NAME` config value (not
  parsed from the data). Keyed by that name under the `BBL` and `Name` external
  systems. Imported before coaches, as the foundational entity.
- **Coaches** — from team pages (`p=tm`). Keyed by exact name under the `BBL`
  and `Name` external systems.
- **Races** — from team pages (`p=tm`). Keyed by exact name under the `BBL`
  and `Name` external systems.

Imported records are matched across systems by external IDs (a coach, for
example, carries `BBL` and `Name` external IDs); other imported game-data types
carry external IDs in the same way.

See also:

- [file-format.md](./file-format.md) — working notes on the source HTML format.
- [prototype.md](./prototype.md) — note on the earlier prototype implementation.
