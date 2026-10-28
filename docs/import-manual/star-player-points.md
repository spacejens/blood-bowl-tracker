# Star Player Points sections

Two data-file sections curate Star Player Points rules rather than entities:
`sppAwardValues`, the standardised award table, and `advancementCosts`, what
each advancement costs. Each is sent to the API as one sync call per run,
after the rows it references exist. See [Data files](index.md) for how
sections are pooled, and [database.md](../database.md#star-player-points) for
how SPP is stored.

## SPP award values

`sppAwardValues` entries seed the standardised Star Player Points award
table. Each entry is `{ rulesSet, race?, actionType, sppValue }`:
`rulesSet` is an external-id pair pointing at a rules set, `race` is an
optional external-id pair pointing at a race, `actionType` is one of the
action types that award Star Player Points (not every match-event action
type — a foul, for example, earns no SPP), and `sppValue` is the SPP
awarded. An entry that omits `race` is that rules set's baseline, applying to
every race with no more specific entry; an entry naming a race overrides the
baseline for it. This section is processed after the rules sets and races it
references.

## Advancement costs

`advancementCosts` entries record how many SPP each advancement costs under a
rules set. Each entry is
`{ rulesSet, advancementNumber, advancementKind, sppCost }`: `rulesSet` is an
external-id pair pointing at a rules set, `advancementNumber` is the 1-based
count of advancements a player has gained (skills and characteristic
increases alike), `advancementKind` says what the cost buys, and `sppCost` is
that one advancement's own cost, not a cumulative threshold. A rules set with
fixed thresholds uses `table_roll` (a roll on its advancement table), each
cost being the gap to the previous threshold. A rules set that prices
advancements by type has one entry per kind it offers for each advancement
number: `random_primary_skill`, `chosen_primary_skill`,
`random_secondary_skill`, `chosen_secondary_skill` or
`random_characteristic`. Both numbers must be positive. A rules set,
advancement number and kind may appear only once across a run's pooled
entries; the API rejects the whole sync otherwise, and the run records it as
one error. This section is processed after the rules sets it references.

A skill a trophy award grants (see
[trophy awards](../game-concepts/trophies/index.md#trophy-award)) is not an
advancement. A cost model skips every trophy-granted skill when numbering a
player's advancements and when summing the SPP they have spent.
