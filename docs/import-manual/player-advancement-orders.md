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
      { skill: { system: "Name", id: "Dirty Player" }, attributeValue: "+1" },
    ],
  },
]
```

An advancement is a skill (by external id, with the variant the player's
stored row carries, if any) or a characteristic increase (`MA`, `ST`, `AG`,
`PA` or `AV`). Starting skills and free extras are not listed.

A stored gained skill the free-extra rules make free (Hatred, Loner, or one a
trophy award grants) counts as a free extra even when its stored row is not
flagged, as a stored row whose flag is not set can be: the entry
leaves it out like any other free extra, the SPP check does not price it,
and applying the entry flags the row as a free extra. The row keeps its
stored number, unconfirmed, so the paid advancements are numbered 1 to n
around it.

An entry may list no advancements. The server accepts that only for a player
who has no paid advancement and has reported no SPP spent, and applying it
flags the player's stored Loner, Hatred or trophy-granted skill as a free
extra without writing any order. It exists to flag a journeyman's Loner.

The order is written confirmed, numbered from 1 in the order listed, so a
later import never replaces it with a guess. The importer skips an entry
whose player or skill does not resolve. For the rest, the server checks each
entry against what is stored before anything of that entry is written, and
refuses that entry with an import error when it fails. The other entries are
still processed, so the entries before and after a refused one are written,
and the batch is left unrecorded. An entry is refused when:

- an advancement listed is not one of the player's stored paid advancements,
  or the player has a paid advancement the entry leaves out (so an entry must
  list every stored paid advancement; if the player later gains one and the TP
  data is downloaded again, a scratch apply is refused until a follow-up batch
  supersedes the entry), or an entry that lists none for a player who has one;
- an advancement listed is a skill the free-extra rules make free (Hatred,
  Loner, or one a trophy award grants), since it is not a paid advancement;
- the player's stored unspent SPP is negative or above his total SPP;
- the player has no paid advancement but his SPP figures say he spent SPP;
- the player's SPP figures are known but he has more than six paid
  advancements, or no rules set of his era prices advancements, so the order
  cannot be checked;
- the order cannot cost exactly the SPP the player reported as spent under
  any rules set of the player's era.

The SPP checks run when the player's total SPP and unspent SPP are both
stored. When either is missing, the order is written confirmed after the
one-for-one match alone. That happens in two cases: a scratch import's first
TP pass stores no unspent SPP yet (no advancement costs exist until batch 004
is applied), and a team imported live leaves the unspent figure unset until a
match or competition import settles it.

The TP SPP adjustments step stores both figures at the end of a bulk TP
import and of a live match or competition import. It then rechecks the order
of every player it writes whose paid advancements are all confirmed, with the
same SPP checks. An order that fails is reported as an import error of that
step, naming the player. The order stays as stored and confirmed, so a later
import still never replaces it with a guess. The error repeats on every later
import that stores the figures, until a follow-up batch supersedes the order
or the data changes. BBL's SPP adjustments step does not recheck: BBL's
unspent figure is priced at BB2020 costs, so under another era's rules sets
it could contradict an order that is right.

A skill's stored source (chosen or random) is kept: the entry changes only
the order, apart from flagging stored free extras as described above. The
player's stored unspent SPP is kept too: when known, the check has just shown
it fits the new order.

This section runs last, after every section that creates the skills and
players it references. Players come from the BBL and TP importers, so a
batch using it applies after them.
