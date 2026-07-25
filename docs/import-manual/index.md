# import-manual

`tools/import-manual/` imports hand-authored supplementary data into the
tracker. Unlike the system-specific importers (`tools/import-bbl/`,
`tools/import-tp/`), which each bring in one external system's data, this tool
lets a developer author a small amount of data by hand — new
leagues/eras/rules-sets/races/positions/coaches/teams, or extra external IDs on
records another importer will also touch.

It is meant to run twice around the system-specific importers:

- **before** them, so a hand-authored record (e.g. a race's full position list,
  or a team pre-registered with a BBL numeric ID) already exists for those
  importers to match against instead of creating a duplicate; and
- **after** them, to clean up names or attach external IDs the system data
  could not supply.

## Configuration

Configuration is supplied through a JSON5 file, `import-manual-config.json5`, in
the tool directory (`tools/import-manual/`). It holds only the connection
settings — the directory to import is a command-line argument, not a config key.
Top-level keys:

- `connection` — runtime settings for reaching the api-server to import into.
  The group itself is required (mirroring `import-tp-config.json5`), even though
  its only current field is optional.
  - `apiBaseUrl` — base URL of the running api-server. Defaults to
    `http://localhost:3000` if unset.

See `import-manual-config.example.json5` for a worked example.

## Data files

The tool reads every `.json5` file directly inside the target directory
(non-recursive), in alphabetical filename order, and pools their sections
together before importing. A single file may mix any of these optional
top-level sections:

```
externalSystems
rulesSets
leagues
eras
races
positions
coaches
teams
competitions
```

Every external-system name referenced anywhere in the pooled data — in
`externalSystems` itself or in any `{ system, id }` pair below — must have a
matching `externalSystems` entry declaring its
[category](../game-concepts/external-systems/index.md). A referenced name with
no matching declaration, or the same name declared twice with different
categories, is a hard error:

```jsonc
externalSystems: [
  { name: "BBL", category: "imported_data_source" },
  { name: "Name", category: "bookkeeping" },
]
```

Every entry in an entity section requires at least one external ID (the API
enforces `externalIds.min(1)` — a record with none could never be matched
again). External IDs and cross-references are written as `{ system, id }`
pairs, where `system` is an external-system name and `id` follows the
`id:`/`name:` namespacing convention (see
[docs/api/imports.md](../api/imports.md)):

```jsonc
{ system: "BBL", id: "id:47" }
{ system: "Name", id: "name:necromantic-2020" }
```

Fields that point at another entity (an era's `league` and `rulesSets`; a
race's or team's `eras`; a position's `raceEras`; a team's `race` and `coach`;
a competition's `era`) are written as external-id pairs pointing at the target
— never a numeric
database ID. A reference resolves against the records processed earlier in the
same run (across all files in the directory), by any pair the target declared.
A reference to something not present anywhere in the directory being imported is
a hard error (one per unresolved reference).

Because none of the `Upsert<Entity>` API schemas support partial updates, a
manual entry must supply the entire required field set for its entity even when
the goal is only to attach one new external ID (genuine partial-field updates
are tracked separately as issue #174).

### Worked example

`data/before-other-importers/necromantic-2020.json5`:
```jsonc
{
  leagues: [
    { name: "My League", externalIds: [{ system: "Name", id: "name:my-league" }] },
  ],
  rulesSets: [
    { name: "CRP", externalIds: [{ system: "Name", id: "name:crp" }] },
  ],
  eras: [
    {
      name: "Season 12",
      league: { system: "Name", id: "name:my-league" },
      rulesSets: [{ system: "Name", id: "name:crp" }],
      startDate: "2024-01-01",
      externalIds: [{ system: "Name", id: "name:season-12" }],
    },
  ],
  races: [
    {
      name: "Necromantic Horror",
      eras: [{ system: "Name", id: "name:season-12" }],
      externalIds: [
        { system: "BBL", id: "id:47" },
        { system: "Name", id: "name:necromantic-horror" },
      ],
    },
  ],
  positions: [
    {
      name: "Zombie",
      isStarPlayer: false,
      raceEras: [
        {
          race: { system: "Name", id: "name:necromantic-horror" },
          era: { system: "Name", id: "name:season-12" },
        },
      ],
      externalIds: [{ system: "Name", id: "name:zombie" }],
    },
  ],
}
```

## Known before-other-importers dedup files

A few `data/before-other-importers/*.json5` files exist specifically to unify
records the BBL and TP importers would otherwise create as separate,
duplicate rows because the two source systems name or key the same
real-world entity differently:

- `races-and-positions.json5` — BBL/TP race and regular position name
  variants.
- `coaches.json5` — BBL's partial name vs. TP's full name for the same coach.
- `teams.json5` — team name variants.
- `star-players.json5` — star player `Position` rows. Both BBL and TP
  importers now attach a `Name` external id equal to the star's bare name
  across all three star-position code paths (the roster-catalog path, the
  inducement-hire path, and the Big Guy mercenary fallback — see
  [file-format.md](./file-format.md#rosters_idjson-races-positions-teams-and-players-parsed)).
  Since star players whose names match verbatim between the two systems now
  dedupe automatically via the shared `Name` external id, manual entries here
  are no longer required for common cases. However, the file mechanism still
  serves to resolve genuine spelling mismatches where BBL and TP disagree —
  smart vs. straight quotes, a leading "The", trailing epithets — which are
  deliberately left unmerged rather than guessed at, for the same reason
  `races-and-positions.json5` leaves ambiguous position renames unpaired: a
  wrong guess would silently conflate two different star players' rows.

## Data layout

The tool works from two well-known subdirectories:

```
tools/import-manual/data/before-other-importers/
tools/import-manual/data/after-other-importers/
```

The whole `tools/import-manual/data` directory is gitignored (nothing under it
is tracked), so create the subdirectories locally before authoring data files
or running the tool:

```bash
mkdir -p tools/import-manual/data/before-other-importers \
         tools/import-manual/data/after-other-importers
```

Author your `.json5` files under whichever phase they belong to. You can also
point the tool at any other directory by passing its path.

## Run it

1. Copy the template and fill in real values:
   ```bash
   cp tools/import-manual/import-manual-config.example.json5 tools/import-manual/import-manual-config.json5
   ```
   `tools/import-manual/import-manual-config.json5` is git-ignored.
2. Build the tool, then run it against a directory (the sole argument):
   ```bash
   pnpm --filter @blood-bowl-tracker/import-manual run build
   ( cd tools/import-manual && node dist/main.js data/before-other-importers )
   ```
   This performs a real import against a running api-server (see
   `connection.apiBaseUrl`). Sample success output:
   ```
   Imported 5 record(s) successfully.
   ```
   On failure the tool exits with a non-zero status. Collected errors (an
   unresolved reference, a rejected upsert) are printed one per line under
   `Import completed with <N> errors:`; an unexpected failure (missing argument,
   unreachable API, malformed JSON5, invalid file shape) is printed as
   `Import failed:`.

## Architecture

- **ImportManualConfigService** — loads `import-manual-config.json5` (JSON5),
  exposing the api-server base URL via `getApiBaseUrl()`.
- **ManualDataReader** — reads every `.json5` file in the target directory,
  validates each against a Zod file-shape schema, and pools all sections.
- **ExternalIdMap / resolve helpers** — map each entity's external-id pairs to
  its database id, and resolve cross-references (recording an `ImportError` per
  unresolved reference).
- **ExternalSystemsProcessor** — bootstraps every external system referenced in
  the pooled data, building a name → id map.
- **Entity processors** (rules sets, leagues, eras, races, positions, coaches,
  teams) — each resolves its references, calls the shared `*ImportService` from
  `packages/import`, and records the upserted record's external ids for later
  references. The positions processor additionally calls `syncRaceEras` to set
  race/era availability.
- **ManualImportService** — orchestrates the reader, the bootstrap, and the
  entity processors in dependency order, aggregating one `ImportResult`.

`main.ts` takes the data directory as its sole CLI argument and runs the
orchestrator, mirroring `tools/import-tp/src/main.ts`'s console/exit-code
contract.
