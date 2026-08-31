# TP source file format — working notes

Temporary notes on TP's JSON API response mirror, used to coordinate between
development sessions. **Remove an entry once its detail is fully encoded in
code** — the code is the source of truth at that point.

One page per source file type, plus the notes that apply across all of them:

- [General notes and entity identifiers](./file-format-general.md) — on-disk
  layout, filename conventions, and TP's own ids and rule-set codes
- [`tournament_<slug>.json`](./file-format-tournament.md) — the competition
  base file
- [`match_<id>.json`](./file-format-match.md) — play date and name, match
  category classification, and the `matchEvents[]` log
- [`rosters_<id>.json`](./file-format-rosters.md) — races, positions, teams
  and players
- [`inscriptions_<slug>_inscriptions.json`](./file-format-inscriptions.md) —
  registered coaches
- [`awards_<slug>_awards.json`](./file-format-awards.md) — trophy awards
