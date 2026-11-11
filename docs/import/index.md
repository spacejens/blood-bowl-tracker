# import

`packages/import` is the shared import orchestration every `tools/import-*`
CLI uses to send data to the tracker: generic upsert bookkeeping plus one
import service per entity, each calling [api-client](../api-client/index.md)
to reach a deployed api-server. A change here reaches all importers at once.

## What it owns

- **Upsert bookkeeping** — `ImportRunnerService`, `BatchBufferService` and
  `ExternalIdResolverService`.
- **Entity import services** — coaches, teams, players, matches, trophies and
  the rest, each calling api-client.
- **The shared upsert plumbing** (`createUpsertImportServiceBase`). For
  entities with exactly one upsert call, the import service is a declarative
  subclass supplying only the client resource it upserts through and the
  wording of its per-item error message, giving it the base class's shared
  `upsert(data, errors)` method. A subclass may still add its own
  entity-specific extra method alongside it.
- **Two kinds of hand-written exception.** Entities with more than one
  _upsert_ entry point stay hand-written, since the base class's single
  `upsert` method can't express two upsert entry points. `ExternalSystems`,
  `SppAwardValues` and `AdvancementCosts` stay hand-written for a different
  reason: an underlying resource that isn't shaped like a plain upsert.
- **The import tools' config services** — `createImportConfigServiceBase`
  (connection getters plus the `IMPORT_CONFIG_ENV` production-file swap, over
  [config-loader](../config-loader/index.md)) and
  `createSourceConfigServiceBase`, so each tool's config and source-config
  services are declarative subclasses supplying only their own file name, env
  var and DI token.
- **Read calls for contract procedures** — `listCompetitionGroups`, backing
  `competitionGroups.list`.
- **Re-exports** — `packages/api-contract`'s `ImportError`/`ImportResult`
  types and [import-shared](../import-shared/index.md)'s result, Name-id and
  cup-rule services, under their established names.

## Why a config-object factory

The base services are class factories taking a config object, not an abstract
class with template methods like
[review-harness](../review-harness/index.md)'s `ReviewServiceBase`. What varies
per entity here is only _data_ (which client resource, what error wording),
not _behavior_, and a config object expresses that directly. This is the
"class factory for a base service" exemption (case 5) in `CLAUDE.md`'s
"Service vs. loose function".

## What it does not own

- **Per-entity parsing.** The BBL and TP entity import services look similar
  but genuinely differ in what they extract, so they stay per-tool (see
  [import-bbl](../import-bbl/index.md) and [import-tp](../import-tp/index.md)).
- **Rules a live import must share.** The server-side `packages/import-tp-live`
  deliberately does not depend on this client-side package, so the rules both
  must apply identically live in [import-shared](../import-shared/index.md).

## Development

```bash
pnpm --filter @blood-bowl-tracker/import run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/import run verify  # build + lint + typecheck + format + test
```
