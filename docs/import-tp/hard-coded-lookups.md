# Hard-coded TP lookups

TP publishes a starting skill's parenthetical value as a `skillAttributeMaster`
with a `type`. Types 0–2 are directly displayable; **type 3 is an opaque
numeric code** into a TP-internal lookup this project does not have, so a
type-3 reference is normally dropped with a recorded import error rather than
composed as-is. Two exceptions are hard-coded, each scoped to its own
skillMasterId so a code confirmed for one skill can never mislabel another's:
`Hatred` (skillMasterId 307) via `HatredTargetService`
(`packages/parse-tp/src/hatred-target.service.ts`) — `100` Dwarf, `102` Troll,
`104` Skaven, `105` Lizardman, `108` Vampire, `110` Undead, `111` Goblin,
`112` Human, `113` Ogre, `117` Beastman, `134` Big Guy, `1001` Daemon — and
`Animosity` (skillMasterId 269) via `AnimosityTargetService`
(`packages/parse-tp/src/animosity-target.service.ts`) — `111` Goblin, `999`
All. A code in the matching table composes normally (`Hatred (Undead)`);
every other type-3 code, or one for a different skillMasterId, keeps the
unchanged drop-and-report behaviour.

The same two tables also decode type-3 attributes on a **player's own**
gained skills, not only on position templates: a player's `Hatred` or
`Animosity` skill is resolved through this identical lookup, and a code
neither table explains drops that one skill with a recorded import error
rather than composing the raw code.

Every `skillMasterId` the scan CAN name is registered as a `tourplay.net`
external id on the skill it names, at ordinary upsert time — exactly as
`TpPositionsImportService` registers every TP position id on one position row.
No curation is needed for those.

A handful of `skillMasterId`s carry no name in any downloaded mirror file at
all, so the scan can never learn them however much history is downloaded.
These are **not** hard-coded: each is curated as a `tourplay.net` external id
on the skill it means, in
`tools/import-manual/data/before-other-importers/skills.json5`, and
`TpPositionSkillsImportService` resolves it through the ordinary external-id
mechanism. Most belong to a skill already known under a different id (TP
assigns a new id to the same skill per rules set), except `Punt` and
`Fumblerooski`, genuinely new to the curated catalogue.

Both type-3 tables are deliberate, hard-coded, id-specific exceptions, not
general decoders. If TP's own lookup or position-keyword data is ever imported
directly, that import should **replace** them rather than sit alongside them.
