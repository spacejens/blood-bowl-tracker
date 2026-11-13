# Star Player Points storage

How Star Player Points awards, advancement costs, unspent SPP and player
advancements are stored. See [database.md](../database.md) for migrations,
history tracking and the other entity-storage pages.

## Award values and precedence

[Star Player Points](../glossary.md#star-player-points-spp) are denormalized
onto `match_events.spp_value` at import time, in the same spirit as
`match_teams.score` — a player's event total is a plain `SUM` over their events
rather than a live re-derivation of rules-set-and-race-specific award rules.
The stored `players.spp_total` is that event sum plus any adjustment
`SppAdjustmentsService` records for SPP the events cannot explain (see
[Unspent SPP](#reading-unspent-spp)).

`spp_award_values` holds the standardised award table, keyed
`(rules_set_id, race_id, action_type)`: a row with `race_id IS NULL` is that
rules set's baseline value for the action, and a non-null `race_id` row is a
per-race override. The table is unique on that key with `NULLS NOT DISTINCT`,
so the baseline row itself is unique per `(rules_set_id, action_type)` rather
than colliding with every override.

TP's own reported figure always wins over the table: BBL-sourced events,
which have no such figure, set `computeSppValue` and let the server resolve
a value from `spp_award_values`; TP-sourced events supply `sppValue`
directly, which takes precedence even if `computeSppValue` is also set.

`spp_award_values` is seeded by `tools/import-manual` in batch 001,
before the source importers, so the table exists before any BBL or TP
match data is imported.

## Advancement costs

`advancement_costs` holds what each advancement costs, keyed
`(rules_set_id, league_id, advancement_number, advancement_kind)`.
`advancement_number` is 1-based and counts every advancement a player gains,
skills and characteristic increases alike; `advancement_kind` says what the
cost buys.

A rules set with fixed thresholds has only `table_roll` rows of its
own (those without a league), a roll on its advancement table whose outcome
is not modelled; a league's rows are described under
[League house rules](#league-house-rules). A rules set that
prices advancements by what the coach takes has one row per kind for each
advancement number, for the kinds that rules set offers: a random or chosen
primary skill, a random or chosen secondary skill, or a random characteristic
increase. BB2025 has no random secondary skill kind, so it has no such row. `granted_skill` is one
fixed skill named by `skill_id`; a check keeps `skill_id` set on exactly the
`granted_skill` rows.

A row stores the cost of that one advancement, never a
cumulative threshold; under fixed thresholds the costs of a player's first N
advancements sum to the Nth threshold. Storing costs keeps one rule for every
rules set: unspent SPP is total SPP minus the costs of the advancements
gained. Both numbers are checked positive.

### League house rules

A row with a null `league_id` is the rules set's own cost and applies to
every player under it. A row with a `league_id` is a league house rule: it
applies only to players of that league, in addition to the rules set's rows,
never in place of them. A player's league comes from player -> `team_eras` ->
era -> league. The unique key is `NULLS NOT DISTINCT`, so rules-set rows stay
unique per `(rules_set_id, advancement_number, advancement_kind)`.

## Reading unspent SPP

`UnspentSppService` in `packages/game-data` reads the `advancement_costs` table
to work out how much of a player's SPP is unspent (see
[players](../game-concepts/players/index.md#unspent-spp)). It tries each rules
set the player's era lists, using that rules set's rows plus the player's
league's rows, and reads the player's characteristic increases as advancement
rows, pinning each entry whose order is confirmed to its advancement number
(see [Order of advancements](#order-of-advancements)). It has no RPC route.

`BblSkillSourceInferenceService` reads the same rows, in the BBL SPP
adjustment sync, to record a gained skill's `player_advancements.source` as
`chosen` or `random` when the spend BBL reports allows only one (see
[players](../game-concepts/players/index.md#unspent-spp)). Only rows still
recorded `advancement` are rewritten.

The skill sync keeps a stored `chosen` or `random` when a source re-sends the generic `advancement`, so a settled
source stays settled and an unchanged re-run writes nothing. A source settled
wrongly, for example before a correction to the cost tables, is fixed by a
data change (see [Changing data in a long-lived
database](../database.md#changing-data-in-a-long-lived-database)), not by
re-importing.

## Stored unspent SPP

`players.unspent_spp` holds a player's unspent SPP only when it is known
exactly (see [players](../game-concepts/players/index.md#unspent-spp)); NULL
means not known exactly. It is written by `SppAdjustmentsService` together
with `spp_total`, in the SPP adjustment sync, the last step of a BBL or TP
import that writes the column, so the two always describe the same total.

A player upsert or a skill sync clears it. A curated order sent with
`checkOrderAgainstSpend` keeps it: when the stored figures are known, that
sync is refused unless they fit the new order exactly. The closing SPP
adjustment sync of an import that runs one writes it back; a plain TP live team import does not
run that sync, so it can leave the value NULL until a later sync. And a trophy award that grants a skill, which only the manual
import writes, marks the skill as a free extra and works the fixed-threshold
value out again.

A stored fixed-threshold value is cleared or recomputed on the writes that change a player's history, but not when reference data (advancement
costs, era rules sets, skill categories, position access) or the model code
changes; it refreshes the next time the player is imported. Rows that existed
before the column was added stay NULL until the next import.

## Free extras

`player_advancements.is_free_extra` marks a gained skill that cost no SPP and is
not one of the player's advancements (see
[skills](../game-concepts/skills/index.md#player-skills)); the cost model prices
it at 0 and leaves it out of the advancement count.

`PlayerSkillsService`
sets it when a sync entry flags it (TP's `isExtra`), when one of the
player's own trophy awards names the skill as `granted_skill_id` (never for
Hatred, Loner or a `starting` row), and for every non-`starting` Hatred or Loner; writing an
award that grants a skill marks the player's matching rows too.

`sync` and a
new trophy award only ever set the flag. Changing or clearing an existing award's granted skill
unmarks that skill's rows for the winner, unless it is Hatred or Loner or another award
of the same player still grants it. The migration that added it backfilled both
server rules over the existing rows. Loner was added to the name rule after the
backfill migration ran, so a stored gained Loner was not marked by it. The
manual import's batch 005 flags those stored rows, one entry per player.

## Player advancements

`player_advancements` holds everything a player has been given: starting
skills, gained skills, free extras and characteristic increases. A
characteristic increase is a row whose `source` is `characteristic`, with its
`characteristic` column (MA, ST, AG, PA or AV) set and no skill, attribute
value or free-extra flag; a check keeps `source = 'characteristic'` and the
two columns in step.

A player can take the same characteristic more than
once, so no uniqueness applies to those rows, while skill rows stay unique per
player, skill and attribute value (two partial unique indexes, one for rows
with an attribute value and one for rows without).

### Order of advancements

`advancement_order` is nullable and is one numbering shared by gained skills
and increases over the player's _paid_ advancements. Starting skills take no
number.

A free extra may carry a recorded number, such as its position among
TP's gained skills or the place BBL's page lists it, but that number is not part of the paid
numbering and can equal a paid advancement's: it is never confirmed, the cost
model prices a free extra at 0 whatever its number, and the deepdive places it
by that number without marking its order as unconfirmed. Only confirmed orders
are sure to follow the paid numbering: a proxy order taken from a skill's
position among TP's gained skills counts free extras and leaves out increases. Null means the
order is unknown.

`order_confirmed` marks an order that is trusted rather than
a presentation proxy (a check requires an order for it).

BBL's order is always
trusted: its Skills cell lists a player's advancements in the order they were
taken, so the BBL import sends every numbered one confirmed, and a migration
confirmed the numbered paid rows already stored for players BBL alone
describes (a BBL external id and no TP one).

BBL numbers a trophy-granted free
extra like a paid advancement, so when a confirmed incoming entry resolves as
a free extra, the sync stores it unconfirmed and moves each of the player's
confirmed paid skills and increases numbered after it down one, closing its
slot. The migration closed such slots the same way, and left unconfirmed a
player with a free extra of unknown number. A trophy award recorded after the
skill does the same when it marks a confirmed row free.

A journeyman's gained Loner closes its slot too (see below). No other path
closes a slot: an unconfirmed incoming entry that turns an already confirmed paid
row into a free extra (no import is known to do this) clears that row's
confirmation and leaves the later numbers as they are. Unmarking does not
reopen the slot: the row stays unconfirmed at its recorded number and the paid
rows keep their closed-up numbers until a later source sync.

TP's order is
trusted where TP's reported spend decides it, including when every fitting
order costs the same, so a confirmed order is not always proven, and also in a
live import with a stored baseline and exactly one new advancement, which that
import confirms even when TP's spend is unavailable. TP's
only other evidence of order is its per-skill row ids, a counter whose order
fits the spend in every checked case, though not its list order.

When a player
has at least two gained skills and each carries a row id no other one shares,
the import takes them in that order and lets the spend confirm only orders
that keep it; otherwise it keeps TP's list order and does not constrain the
deduction. The ids never confirm an order alone, and increases have none
(see [Order of advancements](../import-tp-live/index.md#order-of-advancements)).

While `players.is_journeyman` is set, `JourneymanLonerService` keeps one
starting Loner row for the player. An active one is left as it is, beside any
gained Loner. Otherwise it turns his lowest-id Loner stored as gained (before
he was marked) into the starting one, closing the number that row held in the
confirmed paid numbering or, if unconfirmed, in the proxy numbering. Failing
that, it revives a removed starting Loner, or inserts one. Every write of a
player who is not a journeyman flags his active starting Loner `removed`
(a recruitment), unless his position starts with Loner under some rules set
or is a star-player position (a journeyman is always a basic position).
A starting row holds no number, so the recruit's numbering is unchanged, and
a gained Loner stays a free extra by the name rule. A skills sync whose entry
matches a removed row revives it with the entry's values, so a recruit the
source still lists with Loner gets that Loner back as a gained free extra.
Both the ensure and the retire lock the player's row and re-read his stored
marker first, acting only if it still matches, so of two overlapping writes
of one player the last committed marker always wins.

The migration that introduced the marker converted only existing journeymen
that already had a Loner row, the same way, and invented no starting Loner.
A line-up-only journeyman with no Loner stored stays unmarked until a later
import sees a Loner id in his snapshot.

The cost model pins only confirmed entries to their advancement number, and
every other entry is interchangeable with the rest. A sync never lets an
unconfirmed incoming order overwrite a confirmed stored one.

A row tracked by history cannot be deleted, so an increase a source stops
reporting is flagged `removed` instead (only characteristic rows, and a
recruited journeyman's starting Loner, may be); readers leave removed rows
out. The migration that introduced characteristic rows backfilled one row of
unknown order per unit of the five `*_increase_count` columns it then dropped
from `players`, so the rows are the only current record of increases;
`players_history` snapshots taken before the migration keep the old counts.

## How the costs are curated

The costs are curated by `tools/import-manual` in batch 004 (see
[batches](../import-manual/batches.md)): fixed thresholds of 6, 16, 31, 51, 76
and 176 SPP for CRP, CRP+ and BB2016, and costs by kind for BB2020, DB2021
and BB2025.

The same batch curates tLoEG's house rule under CRP, CRP+ and
BB2016 (the rule does not apply under BB2020, DB2021 or BB2025): a seventh
advancement, costing 125 and so reached at 301 SPP, that grants Fan
Favourite. It is the only league house rule curated. `granted_skill` fits a
league threshold that grants one fixed skill; house rules whose cost depends
on the type of advancement fit the per-kind rows, which sit beside these
rather than replacing them.

Batch 004 is applied after the BBL and TP
importers, whose first run on a scratch import finds no costs and so leaves
the chosen-or-random skill sources and the unspent SPP unset; the scratch
import runs both importers again afterwards to fill them in.
