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
`retired`. There are four kinds of entry:

- **No advancements.** His total SPP is below the cheapest advancement any
  rules set of his era prices, house rules included, and no stat reduction
  is recorded for him. The entry is the position's start values (`pa` only
  when the rules set has Passing), its starting skills, no advancements, and
  the whole total unspent.
- **Lasting injuries.** His total SPP is below the cheapest advancement, and
  every stat reduction recorded for him was suffered in one competition,
  after which his team era played no other competition. No point at which
  lasting injuries heal can have passed. Each reduction worsens the
  position's start value by one: MA, ST and AV go down; AG and PA go down
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
  paid advancements stored, are exactly those advancements. A player given
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
  one while SPP adjustments estimate the competition in progress;
- his total is missing (`spp-missing`);
- his era has no rules set, or a rules set of his era prices nothing
  (`era-unpriced`);
- some reports of a feed player that could name him could also belong to
  someone not stored, or no single way of sharing out the reports of the
  feed players that could name him passes the checks (none, several, one
  that cannot be decided, for example a skill, a price, the total or the
  unspent SPP is missing, or more than 8 reports or 4 players to try), or a
  marked journeyman could own one of those reports (`feed-match-ambiguous`);
- with no feed reports, or as a marked journeyman, his total is at or
  above the cheapest advancement cost of his era (`spp-too-high`);
- he holds any trophy award (a trophy may grant a skill, and one not
  recorded yet looks the same as none), he has a gained Loner, Hatred or
  free extra stored, or the feed reports a Loner, a Hatred or a skill a
  cost row grants (`free-skill-risk`);
- his stat reductions are not certain to last (`lasting-injury-uncertain`);
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

Batches 007 to 011 hold the fills generated this way (see
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
