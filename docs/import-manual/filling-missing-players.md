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
are written in the same transaction as his advancements.

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

## Order

This section runs last, after every section that creates the skills it
references and after `playerAdvancementOrders`. The players come from the TP
importer, so a batch using it applies after the source importers, in a plain
`apply`, once batch 004's advancement costs exist to price the advancements.
