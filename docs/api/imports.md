# Imports

Import tools (see `tools/import-<source>/` in `docs/architecture.md`) bring
data in from upstream applications the tracker doesn't control. This page
describes the general concepts they rely on to avoid creating duplicate
records every time an import is re-run.

## External systems

An [external system](../glossary.md#external-system) names the upstream
application or data source a piece of imported data came from (e.g. BBL). Any
record type that supports import can be linked to one or more external
systems.

## Upsert

Re-running an import is not the same as idempotency: a later run of the same
import might need to add new information to a record created by an earlier
run (for example, a coach gaining an external ID from a second import
source), so a plain "insert if missing, otherwise do nothing" is not enough.
Instead, importable entities expose an **upsert** operation: given a
candidate identity, the server finds a matching existing record (if any),
updates it, and attaches any new identifying information from the request; if
no match is found, it creates a new record instead.

An upsert procedure's response includes a `created` boolean field
distinguishing the two outcomes: `true` when a new record was created,
`false` when an existing one was found and updated.

### Upserts overlay, they do not replace

An upsert writes only the fields the payload actually contains. A field left
out is not mentioned to the database at all, so the stored value survives — a
payload carrying just `name` and `externalIds` renames a row and touches
nothing else. A field sent as `null` is a real write of `null`, which is how a
caller clears a nullable value; the two are deliberately distinguishable.
`externalIds` is always required, because it addresses the row rather than
describing it.

When the supplied external IDs match no existing row the API creates one, and
only then must the payload carry every field that entity requires. A create
missing a required field is rejected up front with an error naming the entity
and the missing fields, rather than surfacing a database constraint violation.

Link-list fields (`rulesSetIds`, `teamEraIds`, `eras`, `raceEras`) work the
same way by being additive: they only ever insert missing links, so an omitted
or empty list leaves existing links intact.

## External IDs

To find a previous record across import runs — and across different import
tools that might import the same real-world entity — importable entities
record a set of **external IDs**: one row per `(external system, identifier)`
pair the record is known by. An identifier is an opaque string scoped to its
external system; by convention it is namespaced by kind, e.g. `id:47` for a
source's own numeric ID, or `name:bob` for a lowercased name used as a
softer, cross-system matcher. A record can have several external IDs, from
several external systems.

An upsert call supplies one or more candidate external IDs. The server looks
up any existing record matching any of them:

- **No match** — a new record is created, and all supplied external IDs are
  attached to it.
- **Exactly one existing record matched** — that record is updated, and any
  supplied external IDs not already stored for it are attached.
- **More than one existing record matched** (different supplied external IDs
  resolve to different existing records) — the request is rejected with a
  `CONFLICT` error and nothing is changed. This surfaces ambiguous or
  conflicting source data for manual resolution rather than silently
  guessing which record is correct.

Matching only ever considers previously-stored external IDs — it never
falls back to fuzzy-matching a record's own display fields (e.g. a coach's
`name` column). A record with no external IDs yet (for example, one entered
manually rather than imported) will not be found by a later import until an
external ID is explicitly attached to it.

## Cross-entity references in manual data files

`tools/import-manual/` lets a developer hand-author supplementary data. Because
a hand-author never sees numeric database IDs, every field in a manual data
file that points at another entity — an era's `league` and `rulesSets`, a race's
or team's `eras`, a position's `raceEras`, a team's `race` and `coach` — is
written as an external-id pair `{ system, id }` (the same `id:`/`name:` form
described above), never a numeric ID. The importer resolves each pair against
the records processed earlier in the same run, by any pair the target declared,
and reports one error per unresolved reference. See
[docs/import-manual/index.md](../import-manual/index.md) for the full data-file
format.
