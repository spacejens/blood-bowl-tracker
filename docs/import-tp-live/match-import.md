# Match import

`TpMatchImportService` (in `TpMatchModule`) imports one TP match. Its two
callers are `TpLiveMatchImportService.importMatch(...)`, below, and the
`tpMatches.import` procedure.

## Importing a match live

```ts
const result = await tpLiveMatchImportService.importMatch({
  matchId: 662796,
  tournamentSlug: 'tloegbbl-sasong-30',
});
```

- `matchId`: TP's match id, the number in the match page URL.
- `tournamentSlug`: the match's tournament, as named in TP's frontend URLs.
- `era`: optional. The era to import the home team under, by name. The away
  team and the competition follow whichever era the home team was imported
  under.
- `session`: optional. A `packages/scrape-tp` session to fetch through, so
  every request of the import is paced as one visit. A fresh session is
  started when omitted.

The import runs these stages in order, each reported in the result even when
an earlier one fails:

1. **Fetch the match** from TP's live API and parse it.
2. **Refuse it if it has no recorded result.** Only a completed match (one
   with `scoreResume.winner`) is imported.
3. **Import the home team live, then the away team**, each through the
   ordinary live team import (see [index.md](index.md#importing-a-team-live)),
   passing that side's match roster snapshot so a player who has since left
   the roster still exists to be referenced by the match's events.
4. **Fetch the tournament and every phase/round fixture list** — the way
   TP's own scores page does — giving every match in the competition's
   bracket, needed for category classification and for the competition's
   date span.
5. **Upsert the competition**: its name, TP id, era (the one the home team
   was imported under), type and dates derived from the fixture lists' dates
   by the same ≤ 3-day cup rule `tools/import-tp`'s bulk import uses. It
   never sends a competition group, so a competition not already curated by
   `tools/import-manual` cannot be created this way.
6. **The shared core**, below, importing the match itself.

Only the requested match is imported; its bracket siblings are used only for
classification and the competition's dates.

## The shared core

`TpMatchImportService.importMatch` resolves the match's competition and
teams, classifies it, and upserts it:

- **Context**: the competition by its TP id (must already be imported), and
  each team by its TP roster id, resolved to its team era in the
  competition's era.
- **Classification**: by the match's ascending `(phaseOrder, round)` position
  among its competition's bracket — see
  [import-tp's match category classification](../import-tp/file-format-match.md#match-category-classification-phasetypephaseorderroundwinner)
  for the full algorithm, including how a final is told from a bronze match
  by which teams won the preceding semifinals.
- **The match row**: upserted under the TP system, keyed by its TP match id
  (matches carry no Name external id — match names are not unique).
- **Participation**: both teams' eras are linked to the match (`match_teams`)
  and to the competition (`competition_teams`); both syncs only ever add, so
  re-importing a match is harmless.
- **Events**: every modeled event from the match's `matchEvents[]` is
  imported, resolving each player by TP `lineUpId`. TP embeds the
  acting/victim player and team directly on every event except casualties
  and fouls, whose action and consequence are logged as separate events and
  are correlated first (casualty ↔ injury by shared `turnNumber`, within a
  time cutoff; sent-off is deliberately not paired with a preceding foul).
  Administrative events (weather, inducements, winnings, and the rest) are
  imported the same way the bulk import decodes them. A player that cannot
  be resolved is a non-fatal error: the event still upserts, with that field
  left unset.
- **Outcome**: TP's own recorded winner (`scoreResume.winner`, including a
  genuine draw) is sent as this match's tie-break; the server only consults
  it when the score is tied and the category forbids a draw, preferring
  bracket progression for a tied qualifier or semifinal. Only this match is
  reported — a bracket-traced outcome (e.g. a final depending on its
  semifinal) settles once the later-stage match is imported, not before.

A stage whose prerequisite failed is not attempted and reports nothing
imported.

## The tpMatches.import procedure

`tools/import-tp`'s bulk run calls this once per match file, so a bulk import
and a live one import a match through the same core. Input:

```ts
{
  match: unknown,        // one TP match exactly as TP's API returns it; parsed server-side
  bracket: TpBracketMatch[], // every match in the match's competition, itself included
  competitionTpId: number,   // TP's tournament id; must already be imported
  externalSystemName: string,
}
```

Output: `{ match, participation, events, outcome }` — one `ImportResult` per
stage.

## Failures

Neither entry point throws for an import problem; every failure is one
`ImportError` in the result.

| Failure                                                                                                      | Reported in                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Match request or parse failure                                                                               | `match`                                     |
| Match not completed (no recorded result); live only                                                          | `match`                                     |
| Team import failures (home or away); live only                                                               | `homeTeam`/`awayTeam`, as for a team import |
| Tournament or fixture-list request/parse failure; live only                                                  | `competition`                               |
| Unknown era, no dated fixtures, or competition upsert failure (including a missing curated group); live only | `competition`                               |
| Competition not imported, team era unresolvable, unclassifiable bracket, or match upsert failure             | `match`                                     |
| Team-link failure                                                                                            | `participation`                             |
| Event upsert failure, or an unresolved player (non-fatal)                                                    | `events`                                    |
| Undecidable outcome                                                                                          | `outcome`                                   |

A stage whose prerequisite failed reports nothing imported.
