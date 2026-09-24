# `inscriptions_<slug>_inscriptions.json` (coaches and roster ids parsed)

See [file-format.md](./file-format.md) for the other pages.

`packages/parse-tp`'s `InscriptionsParserService.parseCoaches()` extracts every
registered coach. The file is an object keyed by category id (a string, e.g.
`"22494"` — matches `tournament.categories[].id` from the base tournament
file), each value an array of registration entries. Only each entry's `player`
object is consumed, yielding `{ id: string, name: string, nafNumber?: number }`
per coach:

- `player.id` — TP's own stable internal account GUID; identical for the same
  coach across every competition and era. Used as the canonical TP external id.
- `player.userNameToShow` — the coach's display name (trimmed). Used as the
  Name external id.
- `player.nafNumber` — the coach's NAF number when NAF-linked (absent for some
  coaches). When present, used as a NAF external id (stringified).

`InscriptionsParserService.parseRosterIds()` reads the same file for each
entry's `roster.id` only: the TP roster id of every registered team, across
every category, duplicates kept. A competition import links these teams to
the competition (see
[import-tp-live's competition import](../import-tp-live/competition-import.md)).

The rest of each entry is unhandled — `state`, `inscriptionDate`, `categoryId`,
the other `player` fields (`nafUser`, `nafVerified`, `country`, `language`),
`coachRank { ... }`, the rest of `roster { ... }`, and `hasMatches`. `roster`
here is a nested copy that lacks `rosterMaster` and, per
[`rosters_<id>.json`](./file-format-rosters.md), is not a source for team import.
