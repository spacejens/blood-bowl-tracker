# Player advancement orders

The `playerAdvancementOrders` section records a player's
[advancement order](../glossary.md#advancement-order) by hand, for a player
whose order no source states and the SPP he spent cannot decide. Each entry
names the player by external id and lists **every** paid advancement he has,
first taken first:

```jsonc
playerAdvancementOrders: [
  {
    player: { system: "tourplay.net", id: "586220" },
    advancements: [
      { skill: { system: "Name", id: "Block" } },
      { characteristic: "AG" },
      { skill: { system: "Name", id: "Hatred" }, attributeValue: "Dwarf" },
    ],
  },
]
```

An advancement is a skill (by external id, with the variant the player's
stored row carries, if any) or a characteristic increase (`MA`, `ST`, `AG`,
`PA` or `AV`). Starting skills and free extras are not listed.

The order is written confirmed, numbered from 1 in the order listed, so a
later import never replaces it with a guess. Before anything is written the
server checks the entry against what is stored, and skips it with an import
error when:

- the player or a skill does not resolve;
- an advancement listed is not one of the player's stored paid advancements,
  or the player has a paid advancement the entry leaves out;
- the player has no consistent reported SPP total and unspent figure, or more
  than six paid advancements, so the order cannot be checked;
- the order cannot cost exactly the SPP the player reported as spent under
  any rules set of the player's era.

A skill's stored source (chosen or random) is kept: the entry changes only
the order. The player's stored unspent SPP is kept too, since the check has
just shown it fits the new order.

This section runs last, after every section that creates the skills and
players it references. Players come from the BBL and TP importers, so a
batch using it applies after them.
