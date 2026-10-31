# Players

A [player](../../glossary.md#player) is an individual on a [team era](../team-eras/index.md)'s roster.

- A player has a name.
- A player belongs to exactly one [team era](../team-eras/index.md), and therefore to exactly one [team](../teams/index.md) and exactly one [era](../eras/index.md).
- A player has exactly one [position](../positions/index.md), which must be
  available for the team era's [race era](../../glossary.md#race-era) — i.e. the
  position must have a relation to that race era. (This is still aspirational:
  no validation code enforces it yet.)
- A player has a **current status**: active, dead, retired, or temporarily
  retired, as their source reports it. A player whose status no source has
  reported has an _unknown_ status, which is deliberately kept distinct from
  being known to be active. This is the source's live state; deaths derived
  from [match events](../match-events/index.md) are a separate thing.
- A player has a **current [lasting injury](../../glossary.md#lasting-injury) state**: whether they must miss
  their next game, how many niggling injuries they carry, and how many
  reductions each of their five [characteristics](../../glossary.md#characteristics)
  currently sits under. This is live state, not history: newer
  [rules sets](../rules-sets/index.md) let these heal between
  [competitions](../competitions/index.md), so what a player has ever suffered
  (which the [match events](../match-events/index.md) record) and what is
  still outstanding are two different facts. BBL publishes this live state
  directly. TP publishes miss-next-game and niggling injuries directly, while
  the importer derives characteristic reductions from characteristic values.
- A reduction count is the _effective_ magnitude — how far the stored
  characteristic actually sits below the player's baseline — not a tally of
  every reduction ever suffered. A reduction the rules absorbed, because the
  characteristic was already at its floor or at the rules' cap on reductions,
  moved nothing and counts zero.
- A player also has a set of **characteristic increase counts**: how many
  times each of their five characteristics has been
  increased by an advancement. These are plain counts rather than per-increase
  records, because neither source publishes a reliable per-increase event: TP
  never records characteristic increases at all (they are only inferable by
  diffing a player's current characteristics against their position's
  baseline), and BBL's ordered advancement list would cover only a minority of
  the data. Zero is a permanently legitimate "never increased", not a
  placeholder.
- A player has a set of **skills**, recorded individually rather than implied
  by their position — see [skills](../skills/index.md). Every skill a player
  has is recorded, starting skills included, each tagged with how they came by
  it.
- Death is not tracked as a lasting injury. It is recorded as a match event
  and surfaced separately.

## Unspent SPP

A player's unspent [SPP](../../glossary.md#star-player-points-spp) is their
total SPP less what their [advancements](../../glossary.md#advancement) cost.
`UnspentSppService` in `packages/game-data` works it out, together with
whether it covers at least the cheapest advancement the player could take
next. Holding SPP back is a normal state, so this is information, never a data
error, and dead, retired and departed players are worked out like any other.

- **It is a range.** CRP, CRP+ and BB2016 charge the same for every
  advancement of a given number, so the spend is exact. BB2020, DB2021 and
  BB2025 price an advancement by its number and its kind, and the recorded
  history rarely pins both down. BBL does not say whether a gained skill was
  rolled or chosen
  ([#1235](https://github.com/spacejens/blood-bowl-tracker/issues/1235)).
  Characteristic increases are counts with no order
  ([#1233](https://github.com/spacejens/blood-bowl-tracker/issues/1233)).
  The recorded skill order is unverified, so it is ignored
  ([#1234](https://github.com/spacejens/blood-bowl-tracker/issues/1234)).
  Whether a skill was primary or secondary comes from the position's
  [skill categories](../skills/index.md#primary-and-secondary-categories); a
  skill outside them could be either. Unspent SPP is therefore the least and
  the most it could be over every order and kind the history allows.
  A stored figure inside the range settles it to that one value; one outside
  it leaves the range and is flagged.
- **The stored figure.** The player record holds unspent SPP only when it is
  known exactly; an empty value means not known exactly, never an estimate.
  How it is known depends on how the rules sets of the player's era price
  advancements, and they must agree, or nothing is stored. Under fixed
  thresholds (CRP, CRP+, BB2016) the cost depends only on how many
  advancements there are, so it is the total less that cost, kept only when
  the history makes it exact. A source's own figure is ignored there: BBL
  prices every player at BB2020 costs. Under rules sets that price by kind
  (BB2020, DB2021, BB2025) it is the figure the source reports, kept unless
  it makes no sense on its own terms: negative, larger than the total
  reported beside it, or reported beside a total other than the stored one.
  It is never worked out from the range, and a figure outside the range is
  still kept: the model does not yet know the order of advancements
  ([#1233](https://github.com/spacejens/blood-bowl-tracker/issues/1233),
  [#1234](https://github.com/spacejens/blood-bowl-tracker/issues/1234)),
  whether a skill was rolled or chosen
  ([#1235](https://github.com/spacejens/blood-bowl-tracker/issues/1235)) or
  which skills were free
  ([#1242](https://github.com/spacejens/blood-bowl-tracker/issues/1242)),
  and the stored figure is what shows the gap. A BBL figure on a rules set
  that prices by kind can still be too low when BBL priced a free or rolled
  skill as a chosen advancement; it is stored as reported unless it fails
  the checks above. Being outside the range only points to a possible gap
  in the history: free skills, an unrecorded order of advancements and
  uncertainty over chosen or random can also cause it. Both sources'
  figures are as of the download or import that read them.
- **What counts as an advancement.** Starting skills and a skill a trophy
  granted (Gudarnas Förkämpe's mutation) cost nothing. A skill a league's
  house rule grants at a fixed advancement (tLoEG's Fan Favourite) counts only
  as that advancement.
- **Several rules sets.** When the player's era lists several rules sets, each
  is tried and the widest range kept. A rules set whose costs the history
  cannot fit is ignored.
- **The verdict.** _Yes_ when even the smallest unspent figure covers the
  cheapest next advancement, _no_ when even the largest does not or no further
  advancement exists, and _maybe_ otherwise. A negative unspent figure is
  reported as is. When the era lists several rules sets, each one that fits
  gives its own verdict: the answer is _yes_ or _no_ only when every one of
  them says so, and _maybe_ otherwise. The reported unspent range and cheapest
  next cost are the widest across those rules sets and can come from different
  ones, so the verdict can be _maybe_ even when the reported smallest unspent
  figure is at least the reported next cost.
- **Accuracy.** Advancements missing from the recorded history make the spend
  look smaller and unspent SPP larger than it is. A _no_ is therefore
  reliable, while a _yes_ can be generous. The exception is a tLoEG player
  under fixed thresholds who has Fan Favourite but a gap in the recorded
  history: Fan Favourite can only be the seventh advancement, so too few
  recorded advancements before it leave no fitting order, and the answer is
  unknown (an inconsistent history) rather than a generous range.
- **Unknown.** The answer is unknown, with a reason, for a star player (star
  players never advance), a player with no total SPP, an era with no rules
  set, rules sets with no advancement costs, or a history that no rules set's
  costs can fit. A history of more than 16 advancements is not searched at all
  and counts as one that cannot fit; no rules set prices anywhere near that
  many. When several apply, the first in that list is reported.
- **Where it is shown.** Of the Discord bot's views, only the
  [player deepdive](../../discord-bot/slash-commands/deepdive-embeds.md#star-player-points)
  shows it, under `Total SPP:`. The bot's toplists of players by SPP
  deliberately leave it out. When the stored figure lies outside the range, the
  deepdive shows both the stored figure and the calculated range.
- **Checked against the sources.** `tools/review-player` re-prices each
  player's advancements independently and compares the resulting spend
  range with the spend each source reports (its total minus its unspent
  figure); BBL is not compared under the fixed-threshold rules sets, since
  it prices every player at BB2020 costs
  ([review-player](../../review-player/index.md)). It also checks the stored
  figure against the range and against the source's own unspent figure. BBL's
  figures are never compared under the fixed-threshold rules sets; the stored
  figure, worked out from the history, covers those players.
