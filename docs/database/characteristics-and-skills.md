# Characteristics and skills storage

How rules-set characteristic formats, position and player characteristics,
the skills catalogue, skill access and player status are stored. See
[database.md](../database.md) for migrations, history tracking and the other
entity-storage pages.

## Characteristic formats

`rules_sets` carries five `characteristic_format` columns
(`move_format`, `strength_format`, `agility_format`, `passing_format`,
`armour_format`), which say whether the rules set has each position
characteristic at all and how it is displayed: `absent` (no such
characteristic — only ever Passing, in the pre-BB2020 rules sets), `bare` (a
plain number), `plus` (a trailing "+", the value being a target a die roll
has to meet) or `plus_zero_legal` (the same target-number format as `plus`,
except a stored 0 is itself legal and renders as a bare "0" rather than the
meaningless "0+" — used only for Passing, where 0 means the position
structurally cannot pass).

## Position characteristics

`position_rules_sets` is the position × rules-set association, holding that
position's Move, Strength, Agility, Passing and Armour under that rules set,
keyed by `(position_id, rules_set_id)`. `passing` is nullable, for rules sets
whose `passing_format` is `absent`. A missing row means the position did not
exist under that rules set. `PositionRulesSetsService.sync` in
`packages/game-data` is the single place that writes it, and it rejects any
row whose values disagree with the rules set's declared formats.

## Skills and skill categories

`skills` is the catalogue of named player abilities (Block, Dodge,
Regeneration, ...), carrying only a name; `skills_external_ids` links each to
the source systems that name it, exactly as every other imported entity.

A skill's _category_ is not on the row, because a rules set can move a skill
between categories (BB2025 introduced Devious and moved existing skills into
it) — it lives on `skill_rules_sets`, the skill × rules-set association, keyed
by `(skill_id, rules_set_id)` and carrying a `skill_category` enum column
(`general`, `agility`, `passing`, `strength`, `mutation`, `devious`, `trait`,
`unique`).

`unique` is the category for the one skill a rules set makes exclusive to a
given star player — used instead of a per-association flag, so an ordinary skill
row stays shareable between positions and a star player's exclusive skill is
identified purely by checking its category.

This is deliberately not enforced as globally unique across star players: if
two star players are published sharing the same "unique" skill, that is not
treated as a data error. A missing `skill_rules_sets` row means the skill does
not exist under that rules set. This is the same split, for the same reason,
as characteristics living on `position_rules_sets` rather than on `positions`.

## Elite skills

The same `skill_rules_sets` row also carries `is_elite`, BB2025's orthogonal
"elite" marker on a handful of skills (Block, Dodge, Guard, Mighty Blow) that
cost more player value to pick than a non-elite skill — not a restriction on
which skills can be picked, and player value itself is not yet modeled, so this
only records which skills the cost applies to.

It is a plain boolean rather than another `skill_category` value because it cuts
across categories, and it is `false` on every row for every rules set older than
BB2025, none of which has the concept at all.

Like the category, it is curated in `tools/import-manual`
(`data/batches/001-initial-seed/skills.json5`; a change goes into a new batch);
the TP importer only reads it back, to cross-check the marker TP's own source
data carries, while BBL has no such marker at all and always supplies `false`.

## Starting skills

`position_rules_set_skills` records a position's _starting_ skills, anchored
to `position_rules_sets.id` rather than to a duplicated position/rules-set
pair, so a starting skill can only ever be recorded against a position and
rules set that already has characteristics recorded.
`PositionRulesSetSkillsService.sync` in `packages/game-data` is the single
place that writes it, and it rejects a row naming a skill with no
`skill_rules_sets` entry for that rules set, or a position/rules-set pair with
no `position_rules_sets` row yet.

## Skill access

`position_rules_set_skill_categories` records which
[skill categories](../glossary.md#skill-category) a position may take skills
from when it advances under one rules set, and whether each is `primary` or
`secondary` (Postgres enum `skill_access`). Like `position_rules_set_skills`
it is anchored to `position_rules_sets.id`. It is unique on that anchor and
the category, so one category is never both primary and secondary for the
same pair.

Only the learnable categories are accepted; `trait` and `unique`
are rejected. `PositionRulesSetSkillCategoriesService.sync` in
`packages/game-data` is the single place that writes it. Each call carries a
pair's complete set, and a category the set no longer lists is flagged
`removed` (see [Curated sets that shrink](../database.md#curated-sets-that-shrink)). The
sources are TP's official team list and `tools/import-manual` (CRP, CRP+,
BB2016, and gap-fill for pairs TP does not supply). BBL is not a source.

## Player characteristics

`players` carries its own `move`, `strength`, `agility`, `passing` and
`armour`: both BBL and TP report a player's _current_ characteristics, which
drift from the position's baseline through injuries and advancements, so
these are stored per player rather than derived from `position_rules_sets`. A
player has exactly one current line — unlike a position, which has one per
rules set — so the columns live directly on the row, and no rules set is
stored alongside them (an era can list several rules sets in sequence, so
none can be derived from a player unambiguously).

`passing` is nullable with
the same meaning as on `position_rules_sets`: NULL asserts that the player's
rules set has no Passing characteristic. The other four are NOT NULL with a
temporary `DEFAULT 0` — a placeholder, since 0 is not a legal value for any of
those four under any rules set — until the BBL and TP imports populate real
values. This does not extend to `passing`, for which 0 is a real value under
a `plus_zero_legal` rules set.

`PlayersService.upsert` accepts the five as an all-or-nothing group paired
with a `rulesSetId` that is used only to validate them (via the same
`CharacteristicFormatValidationService` that `PositionRulesSetsService` uses)
and is never persisted.

## Player status

`players.status` is a nullable `game_data.player_status` enum (active, dead,
retired, temporarily retired). NULL means no source has reported a status and
is deliberately distinct from a known `active`, so no default is set and
existing rows stay NULL. `PlayersService.upsert` leaves the stored status alone
when the caller omits it and clears it back to NULL when the caller sends an
explicit null.

`PlayersService.retireAbsentExternalPlayers` sets `retired` on
the players of a team era that have a purely numeric external id in a given
system but none of the ids the caller says are still present, skipping `dead`
ones (NULL statuses are included); a non-numeric id, such as an inducement
hire's `star-…`, never makes a player a candidate. The TP roster import uses it
for players who left.
