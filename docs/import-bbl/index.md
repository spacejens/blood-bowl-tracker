# import-bbl

`tools/import-bbl/` imports data from the BBL league website (`tloeg.bbleague.se`)
into the tracker via the API. The source data is a `wget` mirror: a folder of
HTML pages named `default.asp?p=<type>&<params>`, encoded ISO-8859-1.

## Configuration

- `BBL_DATA_DIR` — path to the folder that directly contains the
  `default.asp?p=...` files (e.g. `data/tloeg.bbleague.se`). Relative paths
  resolve against the current working directory. The `data/` folder is
  git-ignored; ask the developer for the download if you don't have it.
- `API_BASE_URL` — base URL of the api-server to import into.

## Architecture

- **SourceModule** — reusable, data-type-agnostic core. `BblSourceReader`
  walks the data folder, classifies files by page type (`p=` param), decodes
  ISO-8859-1, and streams pages one at a time (`pages(type)`), keeping memory
  bounded. This is the pattern future data types reuse.
- **CoachesModule** — first data-type extractor. `CoachPageParser` reads a
  coach from a team page; `BblCoachesImportService` streams team pages,
  deduplicates coaches by exact name, and upserts each through `api-client`.

All API calls go through `packages/api-client`. Imports are idempotent
(coaches are matched by their `BBL` / `Name` external IDs), so re-running is
safe and fills any gaps left by transient failures.

## Data types

- **Coaches** — from team pages (`p=tm`). Keyed by exact name under the `BBL`
  and `Name` external systems.

See also:
- [file-format.md](./file-format.md) — working notes on the source HTML format.
- [prototype.md](./prototype.md) — note on the earlier prototype implementation.
