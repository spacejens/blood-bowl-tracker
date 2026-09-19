# Keywords

A **keyword** is a BB2025 label attached to a
[position](../positions/index.md) — `Goblin`, `Undead`, `Big Guy` and so on.
Rules that single out a kind of player name a keyword rather than a
[race](../races/index.md): a skill like Hatred names the keyword it hates,
and every position carrying that keyword is a target.

- A keyword has a name and a **kind**, and nothing else.
- Keywords are a BB2025 concept. No earlier [rules set](../rules-sets/index.md)
  has them, and none of the tracker's earlier-era data records any.

## Keyword kinds

| Kind | Meaning |
| --- | --- |
| `species` | A creature keyword — Elf, Skaven, Undead, Ogre, Squig. |
| `positional` | A role keyword — Big Guy, and (not yet recorded) Special, Blitzer, Thrower. |
| `special` | The sentinel "no restriction", used by Animosity's "All" target. |

## Which positions carry which keywords

Recorded per rules set, against the same position × rules-set association
that carries the position's characteristics — so a keyword can only be
recorded once that position's characteristics under that rules set already
are, exactly like a starting skill.

The relationship is many-to-many in both directions. A position can carry up
to three keywords at once (a Zombie Lineman is Human, Zombie _and_ Undead),
and one keyword is shared by positions from unrelated team races.

A [star player](../star-players/index.md) is a position in this tracker, so
its keywords are recorded the same way.

## Where the catalogue comes from

The names are hand-curated in `tools/import-manual`: the imported source
(tourplay.net) publishes keywords only as opaque numeric codes and never
names them, so each keyword carries the numeric code as a `tourplay.net`
external id alongside the usual `Name` one. Which positions carry which
keyword is imported from tourplay.net; the names are not.
