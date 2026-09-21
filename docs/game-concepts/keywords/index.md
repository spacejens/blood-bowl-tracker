# Keywords

A **keyword** is a label attached to a
[position](../positions/index.md) — `Goblin`, `Undead`, `Big Guy` and so on.
Rules that single out a kind of player name a keyword rather than a
[race](../races/index.md): a skill like Hatred names the keyword it hates,
and every position carrying that keyword is a target.

- A keyword has a name and a **kind**, and nothing else.
- `species` keywords (Elf, Skaven, Undead, and so on) are a BB2025-only
  concept: no earlier [rules set](../rules-sets/index.md) has them, and none
  of the tracker's earlier-era data records any. `positional` keywords
  (including `Big Guy`) are not BB2025-exclusive: DB2021 formally has the
  full positional set too, and BB2020 formally has the `Big Guy` concept —
  a long-standing Blood Bowl rule, not new to BB2025.

## Keyword kinds

| Kind | Meaning |
| --- | --- |
| `species` | A creature keyword — Elf, Skaven, Undead, Ogre, Squig. |
| `positional` | A role keyword — Lineman, Runner, Blitzer, Thrower, Catcher, Blocker, Special, Big Guy. |
| `special` | The sentinel "no restriction", used by Animosity's "All" target. |

## Which positions carry which keywords

Recorded per rules set, against the same position × rules-set association
that carries the position's characteristics — so a keyword can only be
recorded once that position's characteristics under that rules set already
are, exactly like a starting skill.

The relationship is many-to-many in both directions. A position carries one
or more species keywords (a Zombie Lineman is Human, Zombie _and_ Undead) plus
any positional keywords its role gives it, so more than three at once is
ordinary; and one keyword is shared by positions from unrelated team races.

A position's keywords are listed positional-first, then alphabetically within
each group, matching how the rulebook and tourplay.net's own interface present
them.

A [star player](../star-players/index.md) is a position in this tracker, so
its keywords are recorded the same way.

`PositionRulesSetKeywordsService.sync` is insert-only: it adds a keyword
association missing from a later batch, but never removes one that batch no
longer lists, so the join is not authoritative-by-replacement. This matches
how this tracker's other `sync` procedures behave, and is not currently a
practical problem since databases are dropped and re-imported rather than
incrementally synced against stale rows.

## Where the catalogue comes from

The names are hand-curated in `tools/import-manual`: the imported source
(tourplay.net) publishes keywords only as opaque numeric codes and never
names them, so each keyword carries the numeric code as a `tourplay.net`
external id alongside the usual `Name` one. Which positions carry which
keyword is imported from tourplay.net; the names are not.

tourplay.net spreads those codes over three separate fields on each position
and star player, and the importer merges all three into one list: the `race`
array holds the species codes, the integer `positionTypes` bitmask holds the
positional ones (one bit per keyword, and the bit value is the curated code),
and the `isBigGuy` boolean contributes `Big Guy`.
