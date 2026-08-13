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
  The group itself is required.
  - `apiBaseUrl` — base URL of the running api-server. Defaults to
    `http://localhost:3000` if unset.
  - `apiToken` — **required.** The bearer token this tool authenticates with;
    the api-server rejects unauthenticated requests with `401`. Must match the
    `API_TOKEN_IMPORT_MANUAL` value in `apps/discord-bot/.env` (see
    [RPC conventions](../api/rpc-conventions.md)). Treat it like a password —
    `import-manual-config.json5` is git-ignored, so it is never committed.

Running the tool with the environment variable `IMPORT_CONFIG_ENV=production`
makes it read `import-manual-config.production.json5` from the same directory
instead. Both files have exactly the same shape and the same committed
template (`import-manual-config.example.json5`); they differ only in the
values they carry, so a production run can point at the production api-server
without disturbing the local-development config. Both are git-ignored.

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
sppAwardValues
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

An entry only has to supply the fields it actually changes. Every
`Upsert<Entity>` API schema overlays: a field the entry omits is left exactly
as the database has it, so a rename-only entry carries just `name` and the
`externalIds` that match the existing row — no redeclaring the entity's era,
league or race purely to have something to reference. `externalIds` is the one
always-required field, since it is how the row is matched (or, failing that,
created). A field written as explicit `null` is different from an omitted one:
it clears a nullable value (e.g. reopening an era by setting `endDate: null`).

If an entry's `externalIds` match no existing row, the API creates one — and
then the entry must carry everything the entity genuinely requires, or the
upsert fails with a "missing required field(s)" error naming the entity and
the fields. That error almost always means a typo in `externalIds` rather than
a genuinely new entity.

### Worked example

`data/before-other-importers/necromantic-2020.json5`:

```jsonc
{
  "leagues": [
    {
      "name": "My League",
      "externalIds": [{ "system": "Name", "id": "name:my-league" }],
    },
  ],
  "rulesSets": [
    { "name": "CRP", "externalIds": [{ "system": "Name", "id": "name:crp" }] },
  ],
  "eras": [
    {
      "name": "Season 12",
      "league": { "system": "Name", "id": "name:my-league" },
      "rulesSets": [{ "system": "Name", "id": "name:crp" }],
      "startDate": "2024-01-01",
      "externalIds": [{ "system": "Name", "id": "name:season-12" }],
    },
  ],
  "races": [
    {
      "name": "Necromantic Horror",
      "eras": [{ "system": "Name", "id": "name:season-12" }],
      "externalIds": [
        { "system": "BBL", "id": "id:47" },
        { "system": "Name", "id": "name:necromantic-horror" },
      ],
    },
  ],
  "positions": [
    {
      "name": "Zombie",
      "isStarPlayer": false,
      "raceEras": [
        {
          "race": { "system": "Name", "id": "name:necromantic-horror" },
          "era": { "system": "Name", "id": "name:season-12" },
        },
      ],
      "externalIds": [{ "system": "Name", "id": "name:zombie" }],
    },
  ],
}
```

### SPP award values

`sppAwardValues` entries seed the standardised Star Player Points award table
(issue #379). Each entry is `{ rulesSet, race?, actionType, sppValue }`:
`rulesSet` is an external-id pair pointing at a rules set, `race` is an
optional external-id pair pointing at a race, `actionType` is one of the
action types that award Star Player Points (not every match-event action
type — a foul, for example, earns no SPP), and `sppValue` is the SPP
awarded. An entry that
omits `race` is that rules set's baseline, applying to every race with no more
specific entry; an entry naming a race overrides the baseline for it. This
section is processed last, since it references both rules sets and races.

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
- `spp-award-values.json5` — the standardised SPP award table, plus the
  rules-set rows it references — see issue #379. It declares rules sets under
  the `Name` system by their **bare name** (`CRP`, not `name:crp`), so the
  BBL/TP importers' later upserts match the same rows.

## Known after-other-importers cleanup files

`data/after-other-importers/*.json5` files run once the BBL and TP importers
have created their records, to fix up names or attach external IDs the source
systems could not supply:

- `coaches.json5` — TP usernames replaced with a readable coach name. These
  names are pseudonymized (see [Data layout](#data-layout) below), so this is
  where a coach's displayed pseudonym is set.
- `competitions.json5` — normalizes the 35 recurring numbered competitions the
  two source systems named inconsistently (`Season N` / `Major Season N` /
  `tLoEGBBL Säsong N` all become `Major Season N`; stray prefixes are stripped
  from Ogretoberfest, Chaos Cup and Dungeon Bowl entries; each track's
  unnumbered first instalment — e.g. bare `Chaos Cup` — is numbered `1`; and
  BBL's three identically-named `Reserves Rumble` events become
  `Reserves Rumble 1`–`3`).
  Each entry is a pure rename: a `name` plus the `externalIds` that match the
  existing row, which for competitions is the source system's numeric ID alone
  (competitions carry no `Name` external id — issue #285 removed it, because a
  shared `Name` id deduped genuinely distinct same-named competitions onto one
  row). The file declares no eras, league or rules sets: since upserts overlay,
  omitting a competition's `era` leaves its stored era alone, so there is
  nothing to resolve a reference against and nothing to redeclare.
  A manual competition entry can therefore only ever *update* an existing
  competition, never create one: `competitions.startDate` is a required
  column and `competitions.json5` has no field for it. If an entry's
  external IDs don't match an existing row, the upsert now fails loudly
  (`MissingRequiredFieldError`) instead of silently creating a dateless row.

## Data layout

The tool works from two well-known subdirectories:

```
tools/import-manual/data/before-other-importers/
tools/import-manual/data/after-other-importers/
```

Both subdirectories, and the `.json5` files in them, are **committed to git**
(issue #352) — unlike `tools/import-bbl/data` and `tools/import-tp/data`, which
hold bulky regenerable scrapes and stay gitignored. A fresh checkout or a new
worktree therefore already has the reconciled dataset: there is nothing to
create by hand and nothing to sync in from another checkout, and edits to it go
through normal PR review.

Coach `name` values in the committed data are **pseudonyms** — a first name plus
a last initial — because this repository is public. This applies to
`data/before-other-importers/coaches.json5`,
`data/after-other-importers/coaches.json5`, and the coach names mentioned in
`data/before-other-importers/teams.json5`'s comments. Matching and re-import
correctness are driven entirely by `externalIds`, never by `name`, so the
pseudonyms have no functional effect on importing; the only visible consequence
is that the coaches fixed up by `data/after-other-importers/coaches.json5` are
displayed under their pseudonym in the running app. Keep new hand-authored
entries to the same convention, and do not "fix" a pseudonym back to a real
name.

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

To import into the production api-server instead, keep a second config file
`tools/import-manual/import-manual-config.production.json5` (copied from the
same example template, with `apiBaseUrl` changed to `http://localhost:3001`),
run `flyctl proxy 3001:3000` from the repository root in another terminal,
and set `IMPORT_CONFIG_ENV=production` for the run:

```bash
( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/before-other-importers )
```

See [Running import tools against production](../discord-bot/production-hosting.md#running-import-tools-against-production).

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
  teams, competitions) — each resolves its references, calls the shared
  `*ImportService` from `packages/import`, and records the upserted record's
  external ids for later references. The positions processor additionally calls
  `syncRaceEras` to set race/era availability. The competitions processor runs
  last (it depends on eras) and always sends an empty `teamEraIds` list, which
  the API treats additively and so never detaches an imported competition's
  teams.
- **ManualImportService** — orchestrates the reader, the bootstrap, and the
  entity processors in dependency order, aggregating one `ImportResult`.

`main.ts` takes the data directory as its sole CLI argument and runs the
orchestrator, mirroring `tools/import-tp/src/main.ts`'s console/exit-code
contract.
