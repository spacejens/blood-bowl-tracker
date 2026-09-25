# Keyword target decoding

TP publishes a starting skill's parenthetical value as a `skillAttributeMaster`
with a `type`. Types 0–2 are directly displayable; **type 3 is an opaque
numeric code** — a keyword code, from the same id space as a position's own
keyword codes (see [Position keywords](./index.md#position-keywords)).
`TpSkillResolverService.decodeTypeThreeTarget`
resolves it against the curated keyword catalogue
(`TpKeywordCatalogService`, see [Position keywords](./index.md#position-keywords))
for `Hatred` (skillMasterId 307) and `Animosity` (skillMasterId 269) only —
both skills read the same catalogue, since a target is a keyword whichever of
the two names it, so a code confirmed for one applies equally to the other. A
code with no curated match, or a type-3 value on any other skill, is dropped
with a recorded import error rather than composed as-is.

Resolution does **not** filter by keyword kind: the design might suggest a
Hatred target is always a `species` keyword, but confirmed real target codes
include `134` ("Big Guy", a `positional` keyword) and `999` ("All", a
`special` keyword). Any keyword kind is a valid Hatred/Animosity target in
practice.

The positional keywords' own codes — `1`, `2`, `4`, `8`, `16`, `32`, `64`
(TP's `positionTypes` bit values) — now share this same id space, alongside
the species codes (`100`+) and the `999` sentinel. All observed target codes
are `100` or above, so no collision has occurred in practice, but a future
target value matching one of those seven curated bit values would resolve
to a positional keyword rather than raise an uncurated-code import error;
any other value in that range (e.g. `3`) is not itself curated and would
still raise one.

The same lookup also decodes type-3 attributes on a **player's own** gained
skills, not only on position templates: a player's `Hatred` or `Animosity`
skill resolves through the identical catalogue, and a code the catalogue
does not carry drops that one skill with a recorded import error rather than
composing the raw code.

Every `skillMasterId` the scan CAN name is registered as a `tourplay.net`
external id on the skill it names, at ordinary upsert time — exactly as
`packages/import-tp-live`'s `TpOfficialPositionsUpsertService` registers every
TP position id on one position row. No curation is needed for those.

A handful of `skillMasterId`s carry no name in any downloaded mirror file at
all, so the scan can never learn them however much history is downloaded.
Each is curated instead as a `tourplay.net` external id on the skill it means,
in `tools/import-manual/data/before-other-importers/skills.json5`, and
`packages/import-tp-live`'s `TpOfficialSkillRefsService` resolves it through
the ordinary external-id mechanism for the official team list's starting
skills. Most belong to a skill already known under a different id (TP
assigns a new id to the same skill per rules set), except `Punt` and
`Fumblerooski`, genuinely new to the curated catalogue.
