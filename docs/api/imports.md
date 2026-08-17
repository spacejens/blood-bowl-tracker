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

### Batched upserts

Import tools send high-volume records — match events above all — through an
entity's batch upsert instead of one call per record, accumulating payloads
and sending a chunk of up to 500 at a time. The semantics of each individual
upsert are unchanged: same matching by external IDs, same overlay behaviour,
same `created` flag, same per-record error reporting into the run's error
list. The one behavioural difference is a failure mode with no single-item
equivalent — if a whole batched request fails (timeout, dropped connection),
every record in that chunk is reported as failed, so a transient network
blip costs a chunk rather than a single record. A smaller chunk size trades
round trips for a smaller blast radius. Chunk duration is a separate factor
worth watching too: a full chunk means up to 500 sequential server-side
upserts inside one HTTP request, and over a slower network hop — such as a
flyctl proxy tunnel to production — that request could plausibly run tens of
seconds. Treat a first production import as a chance to calibrate chunk size
against the connection in use, rather than assuming the 500 default is safe.

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
missing a required field is rejected up front with a `BAD_REQUEST` error naming
the entity and the missing fields, returned to the caller through the API
itself (not just logged server-side), rather than surfacing a database
constraint violation.

Link-list fields (`rulesSetIds`, `teamEraIds`, `eras`, `raceEras`) work the
same way by being additive: they only ever insert missing links, so an omitted
or empty list leaves existing links intact.

Match events are a partial exception to "an upsert writes only the fields the
payload actually contains": `matchId` is always required, but it identifies
which match the event belongs to rather than describing the event itself, so
it does not count as row data written by the overlay. A match event payload
must also always classify the event by including at least one of `eventType`,
`actionType`, or `consequenceType` — an `externalIds`-only payload is rejected
by validation before it reaches the upsert at all, since there would be
nothing to classify the event as.

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
the database, through the API's `resolve`/`resolveBatch` procedures (see
[RPC conventions](rpc-conventions.md#reference-resolution)), by any pair the
target declared — so a reference resolves whether the target was created
earlier in this run, in the other import phase, or by a different import
tool altogether. One error is reported per unresolved reference. See
[docs/import-manual/index.md](../import-manual/index.md) for the full data-file
format.
