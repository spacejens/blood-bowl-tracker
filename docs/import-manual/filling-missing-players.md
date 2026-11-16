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

The SPP adjustment is not authored: it is worked out the way the TP import
does it, the total minus the SPP the player's imported match events are
worth, never below 0. A stored adjustment is kept. A fill does not set the
journeyman flag.

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

## When an entry is refused

The importer skips an entry whose player or skill does not resolve. For the
rest, the server checks each entry before anything of it is written, and
refuses it with an import error when:

- the player is not a TP player, or is a star player;
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
refused: a fill never overwrites data that is already complete.

## Generated fills

`production-ops-cli generate-incomplete-player-fills` (see
[production-ops-cli](../production-ops-cli/index.md#generating-incomplete-player-fills))
writes entries for the incomplete TP players whose data it can prove. Every
entry has the stored status, else `dead` if a death is recorded, else
`retired`. There are three kinds of entry:

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
- **Advancements from the TP feed** (with `--feed-channel`). The advancement
  reports `read-tp-feed-history` saved are matched to him. The reports of
  one feed player must name exactly one stored player: the same team (found
  by the report's roster link), name and position. The shirt number is not
  stored, so it is not compared, and he must be named by no other feed
  player. His reports, in the order they were posted, are his advancements,
  at most six. Each is priced at its advancement number by the kind the
  report gives: a chosen or random primary or secondary skill, or a random
  characteristic increase (a table roll under fixed thresholds). Every rules
  set of his era must give the same price. The prices must add up to exactly
  his stored total minus his stored unspent SPP, and each must be the cost
  its report shows. The entry is the position's start values with each
  increase applied (MA, ST and AV up by one; AG and PA one better, which is
  one lower in a target-number format), the starting skills, the reported
  skills with their chosen or random source and any variant ("Mighty Blow
  (+1)"), and his stored total and unspent SPP.

A player is skipped, with the reason reported, when any of these holds:

- he is a journeyman (`journeyman`);
- a team era of his team is enrolled in, or plays in a match of, an ongoing
  competition, whatever his stored status (`team-in-ongoing-competition`):
  his data is still changing, and his stored total may understate his real
  one while SPP adjustments estimate the competition in progress;
- his total is missing (`spp-missing`);
- his era has no rules set, or a rules set of his era prices nothing
  (`era-unpriced`);
- the feed reports name him together with another stored player, or two
  feed players name him (`feed-match-ambiguous`);
- with no feed reports, his total is at or above the cheapest advancement
  cost of his era (`spp-too-high`);
- he holds any trophy award (a trophy may grant a skill, and one not
  recorded yet looks the same as none), he has a gained Loner, Hatred or
  free extra stored, or the feed reports a Loner, a Hatred or a skill a
  cost row grants (`free-skill-risk`);
- his stat reductions are not certain to last (`lasting-injury-uncertain`);
- the feed reports advancements and stat reductions are recorded for him
  (`advancement-and-injury`);
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
- the resulting line is not a valid one (`invalid-characteristics`);
- anything already stored would make the fill refuse the entry
  (`stored-data-contradicts`).

The server's checks above still apply when the batch is applied.

Batches 007 and 008 hold the fills generated this way (see
[Batches](batches.md)).

## Order

This section runs last, after every section that creates the skills it
references and after `playerAdvancementOrders`. The players come from the TP
importer, so a batch using it applies after the source importers, in a plain
`apply`, once batch 004's advancement costs exist to price the advancements.
