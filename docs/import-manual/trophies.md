# Trophies section

`trophies` entries seed the curated trophy catalog. Each entry
is `{ name, recipientKind, description?, competitionGroup?, league?,
grantsSkill?, externalIds }` plus its award rule: `recipientKind` is either
`team` or `player`, and `competitionGroup` names the competition group (see
[Competition groups](index.md#competition-groups)) the trophy is
applicable for; `league` names the league it is awarded across instead, when
it is not tied to one competition group. `league` is optional and mutually
exclusive with `competitionGroup` — the database's own check constraint
enforces that exactly one is set. An entry that omits both leaves an
existing trophy's stored classification alone, but a new trophy declaring
neither (or, impossibly, both) is rejected by that constraint at write time;
an entry naming an unknown group or league is likewise recorded as an
import error. This section is processed after the leagues and competition
groups it references. See [Data files](index.md#data-files) for how
sections are pooled.

`grantsSkill` is `true` for a trophy whose award gives its player a skill
outside his advancements: Gudarnas Förkämpe's free mutation is the only one
curated. Omitting it leaves the stored value alone, and a new trophy gets
`false`. The incomplete-player fill generator treats only an award of such a
trophy as a possible free skill (see
[Filling in missing players](filling-missing-players.md#generated-fills)).
Batch 012 restates Gudarnas Förkämpe with it. A restated entry repeats the whole award rule, because the
processor writes an omitted rule column as null.

Trophies deliberately carry no shared `Name` external id, the same precedent
set for competitions: labels like `1st` are ambiguous across competition
tiers, so identity is a curation decision rather than something inferred
from label text alone.

Every trophy TP has been observed to award carries a `tourplay.net` external
id, keyed `${disambiguator}-${groupName}`: the raw TP award's
`name` when present (`Best Stunty`, `Wooden Spoon`) else its numeric
`awardType` (`1`, `2`, `3`), hyphen-joined with the trophy's competition
group name — because TP's `awardType` codes are not globally unique per
trophy on their own. TP's award data covers no other catalog entry today, so
only those trophies are seeded. See
[docs/import-tp/file-format-awards.md](../import-tp/file-format-awards.md) for the full
value table and the evidence behind the scope.
