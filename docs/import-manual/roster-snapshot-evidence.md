# Roster snapshot evidence

The TP downloads under `tools/import-tp/data` show players as TP listed them
on the day of the download. `read-tp-roster-snapshots` collects what they
show (see [production-ops-cli](../production-ops-cli/index.md#reading-the-tp-roster-snapshots)),
and `generate-incomplete-player-fills --snapshots` uses it as evidence for
incomplete players the feed does not name.

## What the files hold

A match file embeds both sides' `lineUps` as TP shows them when downloaded.
An entry has `lineUpMasterId`/`position`, `level`, `skills[]` (bare
`skillMasterId`, starting skills included), `totalStarPlayerPoints`,
`starPlayerPoints` (unspent) and `state`. It has no characteristics, no
chosen-or-random flag, no variant and no order.

A roster file's entries add characteristics, `isRandom`/`isSecondary` and
variants, but only for players still on the roster.

## What was checked

In 1,320 of 1,336 roster entries, `level` equals the gained skills plus the
characteristic increases. The 16 exceptions have more gained skills than
levels (free skills). So `level` counts paid advancements.

When the generator was first run with this evidence, none of the incomplete
players at or above the cheapest advancement appeared in a standalone roster
file, so comparing dated roster copies told nothing about them. All of them
appeared in match files, and no player's match snapshots disagreed.

## What cannot be proven from them

- A characteristic increase, because which characteristic rose is not shown.
- The order of several skills when the spend allows more than one.
- The source of a skill under fixed thresholds.
- The variant of a gained skill.
- Players of teams in ongoing competitions, whose data still changes.

## How it is used

The generator's rules for the snapshot stage and its skip reasons are in
[Generated fills](filling-missing-players.md#generated-fills). Players the
evidence cannot settle stay incomplete and are reported under their reason.
