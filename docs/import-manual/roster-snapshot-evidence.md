# Roster snapshot evidence

The TP downloads under `tools/import-tp/data` show players as TP listed them
on the day of the download. `read-tp-roster-snapshots` collects what they
show (see [production-ops-cli](../production-ops-cli/index.md#reading-the-tp-roster-snapshots)),
and `generate-incomplete-player-fills --snapshots` uses it as evidence for
incomplete players the feed does not name.

## What the files hold

A match file embeds both sides' `lineUps` as TP shows them when downloaded.
An entry has `lineUpMasterId` (the collector reads no position name), `level`, `skills[]` (bare
`skillMasterId`, starting skills included), `totalStarPlayerPoints`,
`starPlayerPoints` (unspent) and `state`. It has no characteristics, no
chosen-or-random flag, no variant and no order.

A roster file's entries add characteristics, `isRandom`/`isSecondary` and
variants, but only for players still on the roster.

## What was checked

In 1,320 of 1,336 roster entries, `level` equals the gained skills plus the
characteristic increases. The 16 exceptions have more gained skills than
levels (free skills). So `level` counts paid advancements.

None of the incomplete players at or above the cheapest advancement appears
in a standalone roster file, so comparing dated roster copies told nothing about them. All of them
appear in match files, and none of them has match snapshots that disagree.
Other players' snapshots can disagree across download runs, and the
generator skips such a player as `snapshot-disagrees`.

## What cannot be proven from them

- A characteristic increase, because which characteristic rose is not shown.
- The order of several skills when the spend allows more than one.
- The source of a skill under fixed thresholds.
- The variant of a gained skill.
- Players of teams in ongoing competitions, whose data still changes.
- His state at the match. A match file shows him as of its download run, so
  the evidence is only as current as the newest download containing him.
  The stored unspent SPP, taken from another source, must therefore be
  present and equal to the snapshot's: it is the check against a snapshot
  gone stale, for example one taken before he spent SPP.
- A free skill the generator cannot see together with a characteristic
  increase. The two would make his level equal his gained-skill count, so
  anyone relaxing the rule that exactly one order must fit, for players
  with several advancements, must account for it.

## How it is used

`--snapshots` does not check how old the evidence file is, so run
`read-tp-roster-snapshots` again after every download.

The generator's rules for the snapshot stage and its skip reasons are in
[Generated fills](filling-missing-players.md#generated-fills). Players the
evidence cannot settle stay incomplete and are reported under their reason.
