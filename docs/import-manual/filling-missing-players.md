# Filling in missing players

The `incompletePlayerFills` section supplies the complete data of a TP
player whose import left it incomplete, in the sense
[`/debugincompleteimport`](../discord-bot/slash-commands/debug-incomplete-import.md)
counts: a zero movement, strength, agility or armour, or a missing total SPP,
SPP adjustment or status. Once an entry is applied, the command stops
counting the player.

```jsonc
incompletePlayerFills: [
  {
    player: { system: "tourplay.net", id: "586220" },
    status: "active",
    characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
    sppTotal: 18,
    unspentSpp: 0,
    startingSkills: [
      { system: "Name", id: "Block" },
      { skill: { system: "Name", id: "Loner" }, attributeValue: "4+" },
    ],
    advancements: [
      { skill: { system: "Name", id: "Dodge" }, source: "chosen" },
      { characteristic: "AG" },
      {
        skill: { system: "Name", id: "Hatred" },
        attributeValue: "Dwarf",
        freeExtra: true,
      },
    ],
  },
]
```

Every field is required except where noted, so an entry is never partial:

- `player` — the player's TP external id. Only TP players can be filled in.
- `status` — `active`, `dead`, `retired` or `temporarily_retired`.
- `characteristics` — `ma`, `st`, `ag` and `av`, each at least 1, and `pa`.
  `pa` is required when the rules set of the player's era has a Passing
  characteristic (`0` stands for "-") and must be left out when it has none.
- `sppTotal` and `unspentSpp` — the player's total and unspent SPP.
- `startingSkills` — each a skill reference, or `{ skill, attributeValue }`
  for a skill whose stored row carries a variant.
- `advancements` — every advancement, first taken first: a skill (with an
  optional `attributeValue`, an optional `source` of `chosen` or `random`,
  and `freeExtra: true` for a skill gained outside the paid advancements),
  or a characteristic increase (`MA`, `ST`, `AG`, `PA` or `AV`).
- `journeyman` — optional, and only `true`: the player is a journeyman
  whose stored marker is set. The server keeps his starting Loner, so
  `startingSkills` must not list Loner. See [Journeymen](#journeymen).

The SPP adjustment is not authored: it is worked out the way the TP import
does it, the total minus the SPP the player's imported match events are
worth, never below 0. A stored adjustment is kept. A fill does not change the
journeyman marker.

## What is written

The advancements are written in the order listed, confirmed, and numbered
from 1 among the paid ones, so a later import never replaces the order with
a guess. A skill the free-extra rules make free (Hatred, Loner, or one a
trophy award grants) is stored as a free extra, like a `freeExtra: true`
skill, and the paid advancements are numbered around it. A skill listed
without a `source` keeps a chosen or random source already stored. The
player's characteristics, total SPP, unspent SPP, status and SPP adjustment
are written in the same transaction as his advancements. A later TP import
whose data establishes no status for him keeps the filled one (see
[player status](../import-tp/index.md#player-status)); one that finds him
absent from a non-empty roster still retires him, as for any TP player. The unspent SPP has no
such protection: a TP import writes it as not known, and under a rules set
that prices advancements by kind only a TP snapshot restores it. A filled
player can therefore lose it without counting as incomplete again, and
applying the same entry again is then refused, because his stored data no
longer equals the entry.

The same transaction records his lasting stat reductions (see
[Recording lasting reductions](#recording-lasting-reductions)). His niggling
injuries and whether he misses the next game are not written and stay at
none.

## Journeymen

An entry with `journeyman: true` fills a journeyman the TP import has
marked (see [Journeymen](../game-concepts/players/index.md#journeymen)).
His Loner is a starting skill the server owns. The entry leaves it out,
the stored starting Loner is expected beside the entry's starting skills,
and the server keeps or inserts it in the same transaction that writes the
rest. An entry without the field leaves the marker and any Loner alone, so
a stored starting Loner it does not list is a contradiction.

## When an entry is refused

The importer skips an entry whose player or skill does not resolve. For the
rest, the server checks each entry before anything of it is written, and
refuses it with an import error when:

- the player is not a TP player, or is a star player;
- the entry says `journeyman: true` and the player's stored marker is not
  set, or his position carries the Big Guy keyword under a rules set of his
  era (not a basic position), or the entry lists Loner among its starting
  skills or advancements;
- the player is no longer counted as incomplete, and his stored data is not
  exactly what the entry would write (see [Re-running](#re-running));
- a value already stored for him disagrees with the entry: a non-zero
  movement, strength, agility or armour, a stored passing, total SPP,
  unspent SPP or status, or a stored skill or increase the entry does not
  list (or lists with a different chosen-or-random source, a different
  confirmed number, or as paid where the stored one is a free extra);
- the same skill with the same variant is listed twice, as a starting skill
  and an advancement or as two advancements;
- the characteristics do not fit any rules set of his era, including a
  missing or unexpected `pa`;
- the unspent SPP is above the total, or the advancements cannot cost exactly
  the SPP he spent (total minus unspent) under any rules set of his era, with
  the listed order as the only one allowed; a player with more than six paid
  advancements, or in an era no rules set prices, is refused because the
  order cannot be checked.

A refused entry writes nothing. The other entries are still processed, and
the batch is left unrecorded, as for
[player advancement orders](player-advancement-orders.md).

## Re-running

A player filled in is no longer incomplete, so applying the same entry again
changes nothing and is not an error. Applying a different entry for him is
refused: a fill never overwrites data that is already complete. For a
journeyman entry, the comparison includes his stored starting Loner, so the
same entry is again `unchanged`.

## Generated fills

`production-ops-cli generate-incomplete-player-fills` (see
[production-ops-cli](../production-ops-cli/index.md#generating-incomplete-player-fills))
writes entries for the incomplete TP players whose data it can prove. Every
entry has the stored status, else `dead` if a death is recorded, else
`retired`. There are five kinds of entry:

- **No advancements.** His total SPP is below the cheapest advancement any
  rules set of his era prices, house rules included, and no stat reduction
  is recorded for him. The entry is the position's start values (`pa` only
  when the rules set has Passing), its starting skills, no advancements, and
  the whole total unspent.
- **Lasting injuries.** His total SPP is below the cheapest advancement, and
  every stat reduction recorded for him certainly still applies. Under
  BB2020, DB2021 and BB2025, niggling injuries and characteristic
  reductions can heal between competitions, and healing is optional, so a
  reduction is certain only when no such point can have passed while he
  was on the team. Under CRP, CRP+ and BB2016 they never heal. The
  reductions are certain when one of these holds:
  - every rules set of his era is stored as one under which they never
    heal (`lastingInjuriesNeverHeal`, which batch 015 sets for CRP, CRP+
    and BB2016); an era with no rules set, or with any rules set not
    flagged, counts as one where they may heal;
  - every reduction was suffered in one competition, after which his team
    era played no other competition;
  - he died, every reduction was suffered no later than his death (the
    earliest match recording it), and no competition of his team era
    other than the one of his first reduction both started by his death
    and had a match after that reduction. The death proof applies only
    when his stored status is unknown or dead and no match event names
    him in a match played after his death match.

  The generator reads which rules sets never heal from the database
  (`rules_sets.lasting_injuries_never_heal`, see
  [Rules sets](index.md#rules-sets)); it holds no list of rules set names.
  A rules set nobody has curated reads as possibly healing, so the generator
  proves fewer fills, never a wrong one. Its query needs the column, so run
  it only against a database whose migrations include it.

  Each reduction worsens the position's start value by one: MA, ST and AV go down; AG and PA go down
  when bare and up in a target-number format. A characteristic is never
  worsened by more than two in all, and never past MA 1, ST 1, AV 1 (3+ in
  a target-number format), and AG and PA 1 (6+ in a target-number format).
  A PA of 0 (cannot pass) stays 0. These limits are the rulebooks'; the
  database does not hold them. The rest is as for no advancements.

- **Journeymen.** A player whose stored journeyman marker is set (a
  line-up or roster that listed Loner set it, and no roster has since shown
  him recruited), in a basic position, and otherwise filled as for no
  advancements, with no stat reduction recorded. The entry has
  `journeyman: true` and leaves his Loner out of the starting skills; his
  stored starting Loner is not compared and is not a free-skill risk. A
  player merely named Journeyman with no marker stays incomplete. One
  uncertainty remains: a recruit who kept the name and left the team, seen
  since only in line-ups without Loner, still carries the marker. The
  database stores no line-up snapshots to rule that out. It matters only
  below the cheapest advancement, where such a player differs from his
  fill only by a Loner he no longer has.
- **Advancements from the TP feed** (with `--feed-channel`). The advancement
  reports `read-tp-feed-history` saved are matched to him. A report can
  belong only to a stored TP player (a player with no `tourplay.net` id is
  never one, since the feed reports only TP players) of the team its roster
  link names, with its name and position, whose stored total is at least
  the cost the report shows. The shirt number is not stored and can change
  in TP, so it is not compared. A feed player none of whose reports anyone
  stored can own names nobody stored. One feed player with one possible
  owner gives him its reports. Feed players that share a possible owner are
  decided together: every way of giving each report to one of its possible
  owners is tried. A way is valid when each player's reports, in the order
  they were posted, pass the pricing checks below and, for a player with
  paid advancements stored, are exactly those advancements. A shown cost
  below its price rules a player out: a report the feed lacks before his
  reports would only move them to later advancement numbers, and the cost
  of an advancement kind never falls as the number rises (true of every
  cost stored today). Shown costs adding up to more than the SPP he spent
  rule him out too, since they are what he paid. Otherwise, a shown cost
  above its price may mean the feed lacks an earlier report, and prices
  adding up to less than the SPP he spent that it lacks a later one. Either
  way the check cannot be decided and the feed players sharing him stay
  ambiguous (unless a report is not among his stored paid advancements,
  which rules him out). Only a complete player's stored paid advancements
  are taken as his full list. An incomplete player's are being
  reconstructed and may be partial, so reports that differ from them, or
  are not among them, leave the check undecided instead. A player given
  no reports is always valid, since the feed only goes back to the end
  of 2022. When exactly one way is valid, each player gets his reports.
  His reports, in the order they were posted, are his advancements, at
  most six. Each is priced at its advancement number by the kind the
  report gives: a chosen or random primary or secondary skill, or a random
  characteristic increase (a table roll under fixed thresholds). Every rules
  set of his era must give the same price. The prices must add up to exactly
  his stored total minus his stored unspent SPP, and each must be the cost
  its report shows. The entry is the position's start values with each
  increase applied (MA, ST and AV up by one; AG and PA one better, which is
  one lower in a target-number format), the starting skills, the reported
  skills with their chosen or random source and any variant ("Mighty Blow
  (+1)"), and his stored total and unspent SPP.
  When stat reductions are recorded for him, they must certainly last, as
  for lasting injuries above, and they are applied together with the
  increases in the order they happened: an increase when its report was
  posted, a reduction when its match was played. Each change applies the
  limits above as it happens, so an increase can lift a value a reduction
  left at its floor, and the cap of two counts only reductions that worsened
  the value. A characteristic with an increase and more than two reductions
  is skipped, because there the cap is ambiguous. Changes to one
  characteristic on the same UTC day have no known order, and every order of
  them must give the same value.
  This ordering rests on two assumptions. A reduction is placed at its
  match's recorded play time, which can be an estimate when the source gave
  no play date. An increase is placed at its report's post time.
- **Advancements from TP roster snapshots** (with `--snapshots`). For a
  player the feed does not name (without `--feed-channel`, every such
  player) whose total is at or above the cheapest advancement, the
  downloaded TP match and roster files
  (`read-tp-roster-snapshots`) give his level, his skills by TP id, and
  his total and unspent SPP. They must show him in one state, with his
  stored total, his stored position (by its TP ids) and his stored unspent
  SPP, which must be present: a file shows him as of its download run, and
  the stored unspent SPP is the check that it is not out of date. Each skill id must name one stored
  skill (by its `tourplay.net` id). His gained skills are those less his
  position's starting skills, and must number exactly his level, which
  counts his paid advancements: a higher level means a characteristic
  increase the files cannot name, a lower one a free skill. Each gained
  skill must have one `Name` id and be held with a variant by no player
  or position, since the files name no variant. Each is primary or
  secondary by his position's access to its category. Every order of
  them, with every chosen-or-random source, is priced as for the feed,
  and exactly one must cost exactly his total minus his unspent SPP
  (nothing, for level 0). Two skills of the same kind, or any skill
  under fixed thresholds, always fit more than one way, so such players
  are not filled. Stat reductions are handled as for lasting injuries.
  The entry is the position's start values (with any reductions), its
  starting skills, the skills in that order with their source, and his
  total and unspent SPP. See
  [Roster snapshot evidence](roster-snapshot-evidence.md) for what the
  files show and what they cannot.

A player is skipped, with the reason reported, when any of these holds. The
list is not in precedence order: he is reported by the first reason that
applies in the planner's order, which checks `team-in-ongoing-competition`,
`spp-missing` and `era-unpriced` before `journeyman`, and for stat reductions
checks `feed-match-ambiguous`, `spp-too-high` and `free-skill-risk` before it.

- he is a marked journeyman whose position carries the Big Guy keyword
  under a rules set of his era (not a basic position), or who has stat
  reductions recorded (`journeyman`);
- a team era of his team is enrolled in, or plays in a match of, an ongoing
  competition, whatever his stored status (`team-in-ongoing-competition`):
  his data is still changing, and his stored total may understate his real
  one while SPP adjustments estimate the competition in progress. A
  competition is ongoing when it has a `tourplay.net` id and no stored end
  date, which the TP importers write only once TP shows it finished;
- his total is missing (`spp-missing`);
- his era has no rules set, or a rules set of his era prices nothing
  (`era-unpriced`);
- some reports of a feed player that could name him could also belong to
  someone not stored, or no single way of sharing out the reports of the
  feed players that could name him passes the checks (none, several, one
  that cannot be decided, for example a skill, a price, the total or the
  unspent SPP is missing, or a player's reports are priced correctly but add
  up to less than the SPP he spent, so the feed may lack a later report, or
  more than 8 reports or 4 players to try), or a
  marked journeyman could own one of those reports (`feed-match-ambiguous`);
- with no feed reports and without `--snapshots`, or as a marked
  journeyman, his total is at or above the cheapest advancement cost of his
  era (`spp-too-high`);
- he holds an award of a trophy curated as granting a skill (see
  [Trophies section](trophies.md); a granted skill not recorded yet looks
  the same as none) or an award that records a granted skill, whatever its
  trophy is curated as, he has a gained Loner, Hatred or free extra stored, or
  the feed reports a Loner, a Hatred or a skill a cost row grants
  (`free-skill-risk`);
- his stat reductions are not certain to last: none of the proofs under
  lasting injuries above holds (`lasting-injury-uncertain`). A match date
  that cannot be read only fails the proofs that compare dates (one
  competition, death), never the never-healing era proof, which reads none;
- with `--snapshots`: no downloaded file shows him (`snapshot-missing`);
  the files show him in more than one state (`snapshot-disagrees`); their
  total, unspent SPP or position differs from the stored one, or one of
  his position's starting skills is missing from the snapshot
  (`snapshot-conflicts-stored`); his unspent SPP is not stored
  (`unspent-spp-missing`); his level is below his gained skills
  (`snapshot-level-mismatch`) or above them
  (`snapshot-characteristic-increase`); no order and source of them
  costs the SPP he spent (`snapshot-spend-mismatch`), or more than one
  does (`snapshot-order-ambiguous`). The feed's checks
  `spp-does-not-add-up`, `skill-unresolved` (also a gained skill with no
  single `Name` id or held with a variant), `duplicate-skill`,
  `too-many-advancements`, `skill-category-mismatch`,
  `rules-sets-disagree` and `free-skill-risk` apply to the snapshot's
  skills too;
- with feed reports: his unspent SPP is not stored
  (`unspent-spp-missing`); there are more than six reports
  (`too-many-advancements`); a reported skill names no stored skill, or
  several (`skill-unresolved`); a reported skill repeats a starting skill
  or another report, in any variant (`duplicate-skill`); the position's
  access puts a reported skill on the other side of primary and secondary
  than the report, or gives a category two different accesses
  (`skill-category-mismatch`); the rules sets of his era price the reports
  differently (`rules-sets-disagree`); the prices cannot be found, or do
  not add up to the SPP he spent (`spp-does-not-add-up`); or a price is not
  the cost the report shows (`feed-cost-mismatch`);
- his position's data differs between the rules sets of his era, or names a
  skill with no `Name` id or with an empty attribute value
  (`position-ambiguous`);
- same-day changes to one characteristic give different values depending on
  their order, or a characteristic has both increases and more than two
  reductions (`characteristic-order-uncertain`);
- the resulting line is not a valid one (`invalid-characteristics`);
- anything already stored would make the fill refuse the entry
  (`stored-data-contradicts`).

The server's checks above still apply when the batch is applied.

The generated file also holds a `lastingInjuryRepairs` section, see
[Recording lasting reductions](#recording-lasting-reductions).

Batches 007 to 014 hold the fills generated this way (see
[Batches](batches.md)).

## Recording lasting reductions

A fill records the player's lasting stat reductions, the counts the player
deepdive shows under "Lasting injuries" (`AV -1`). They are not authored. For
each characteristic, the server takes his characteristic increases on it and
subtracts how many steps better than the position's start value the value is
(a worse value counts as negative steps), never going below 0. The start
value is the one of his era's rules set the deepdive compares against. So a
value one worse than the start value with no increase is one reduction, and
a value equal to it with one increase is also one: an increase undone by a
reduction. AG and PA are better when lower in a target-number format, every
other characteristic when higher. A characteristic with no start value, and
PA under a rules set without Passing, records none. The counts follow the
same identity the TP import uses between a player's increases and his
reductions (increases = better-side gap + reduction). Unlike the TP import,
a reduction that cancels an increase is recorded, because the increases come
from the player's stored advancements. A fill also overwrites reduction
counts stored for the player, which is safe because an incomplete player has
none stored in practice. Niggling injuries and missing the next game are not
recorded.

Players filled before fills recorded their reductions get them through the
`lastingInjuryRepairs` section:

```jsonc
lastingInjuryRepairs: [{ player: { system: "tourplay.net", id: "586220" } }]
```

An entry names one TP player and carries no counts: the server derives them
from his stored characteristics and increases as above, and writes only the
five reduction counts. The importer skips an entry whose player does not
resolve. The server refuses, with an import error, a player who is not a TP
player, is a star player or is still counted as incomplete (fill him in
instead). It writes nothing for a player who already has a reduction stored,
or whose stored line does not show a reduction (it healed, it was absorbed
by a limit, the position has no start value, or the stored line is out of
date). Applying the same entry again changes nothing.

`generate-incomplete-player-fills` lists every non-star TP player who is no
longer incomplete, has a stat reduction recorded in a match and has no
reduction stored, and whose stored line shows a reduction the server would
record. It reads his stored line, his active characteristic increases and
the rules set the server compares against, and derives his counts the same
way the server does (a spec runs the derivation side by side). A player whose
reduction healed, was absorbed by a limit, has no start value to compare
against, or whose stored line is out of date is left out, since his entry
would change nothing; the report counts him under
`lastingInjuryRepairsNothingToRecord`.

## Order

This section runs last, after every section that creates the skills it
references and after `playerAdvancementOrders`; `lastingInjuryRepairs` runs
after it, so a player filled in the same batch is complete by then. The
players come from the TP importer, so a batch using either applies after the
source importers, in a plain `apply`, once batch 004's advancement costs
exist to price the advancements.
