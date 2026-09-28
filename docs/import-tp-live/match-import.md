# Match import

`TpMatchImportService` (in `TpMatchModule`) imports one TP match. Its two
callers are `TpLiveMatchImportService.importMatch(...)`, below, and the
`tpMatches.import` procedure.

## Importing a match live

```ts
const result = await tpLiveMatchImportService.importMatch({
  matchId: 662796,
  tournamentSlug: 'tloegbbl-sasong-30',
  externalSystemName: 'TP',
});
```

- `matchId`: TP's match id, the number in the match page URL.
- `tournamentSlug`: the match's tournament, as named in TP's frontend URLs.
- `era`: optional. The era to import the home team under, by name. The away
  team and the competition follow whichever era the home team was imported
  under.
- `externalSystemName`: required. The name TP's external system is
  registered under, passed to both team imports, the competition and the
  match. Keep it in sync with the bulk import's configured name.
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
4. **Import the star players either team hired** through the match's
   inducements — see [Star player hires](#star-player-hires) below. Only
   attempted once both teams were imported; a failed hire never stops the
   rest of the import.
5. **Fetch the tournament and every phase/round fixture list** — the way
   TP's own scores page does — giving every match in the competition's
   bracket, needed for category classification and for the competition's
   date span.
6. **Upsert the competition**: its TP id, era (the one the home team was
   imported under), type and start date derived from the fixture lists' dates (a
   competition this import creates gets no end date; see below) by
   the same ≤ 3-day cup rule `tools/import-tp`'s bulk import uses. A new
   competition's group, name and preferred type come from matching its raw
   name against the curated groups' name patterns; one matching no group, or
   several, is not created. An already-imported competition keeps its stored
   name — TP's raw name never overwrites it. This is the
   competition import's own upsert stage (see
   [competition-import.md](competition-import.md)); a match import does not
   link the competition's other teams or record its awards.
7. **The shared core**, below, importing the match itself.

Only the requested match is imported; its bracket siblings are used only for
classification and the competition's dates — unless step 5 created the
competition, below.

### Backfilling a brand-new competition

When step 5 creates the competition (it was never imported before), the
import then completes it rather than leaving it holding one match, running
up to three more steps after the shared core:

1. **Backfill its registered teams**: fetch the inscriptions, import each
   registered team live under the competition's era, link them to the
   competition, then fetch and record its trophy awards — the same stages a
   live competition import runs (see
   [competition-import.md](competition-import.md)).
2. **Backfill its completed matches**: every bracket match with a recorded
   result, one at a time through the same session, the requested match
   included again (harmless: every write is an upsert).
3. **Finish it**: only when step 1 recorded at least one TP award, which
   means the competition is finished. Re-upsert the competition as finished
   over the whole bracket's played dates, which settles its end date, then
   award the trophies TP does not record itself, the same step 8 a live
   competition import runs (see [competition-import.md](competition-import.md)).

The result then also carries `participantsBackfill` (`teams`,
`participation`, `trophyAwards`) and `matchesBackfill` (one `ImportResult`
for all backfilled matches) and `extraTrophyAwards` (one `ImportResult`: the
finishing re-upsert's errors and the extra awards created; nothing imported
when TP has no awards yet). A backfill failure is reported there and never
fails the match import itself. The bulk `tpMatches.import` procedure never
upserts a competition, so it never backfills.

## Importing a match's teams live

```ts
const result = await tpLiveMatchTeamsImportService.importMatchTeams({
  matchId: 670570,
  tournamentSlug: 'tloeg-blood-bowl-league-sasong-31',
  externalSystemName: 'TP',
});
```

`TpLiveMatchTeamsImportService.importMatchTeams(...)` takes the same options
as `importMatch` and imports only the match's two teams: it fetches the
match, then imports the home team and then the away team through the
ordinary live team import (see [index.md](index.md#importing-a-team-live)),
each with that side's match roster snapshot, the away team under the era the
home team was imported under — the same era rule as a full match import. It
accepts a match in any state: a match that has not finished yet is not an
error, because its teams exist and can be brought up to date before it is
played. It writes no match, competition or star player hire.

The result carries `match` (the match fetch: only ever failures, never
counted as imported), `homeTeam` and `awayTeam`. A failed fetch imports no
team; a home team that was not imported leaves the away team unattempted.
Nothing is thrown: an unexpected error is reported on `match`.

## Star player hires

A star player a team hires for one match is on no roster, so the match's
own `inducements_roll` events are the only place the hire shows up.
`TpLiveStarPlayerHiresService` imports each distinct hire (one per roster
and TP `lineUpMasterId`, however many times it is listed):

- **The star's position** is upserted as a star player, keyed by its bare
  name as a TP id and its Name id — the same keys the official team list
  import gives a star, so both land on one row.
- **Its stat line** is the position's catalog characteristics for the hiring
  team's era, read from the database. The official team list must already
  have been imported for that era; a hire whose position has no catalog
  characteristics there is skipped with an error.
- **The hired player** is upserted into the hiring team's era, keyed by TP
  id `star-<rosterId>-<lineUpMasterId>` — the same key `tools/import-tp`'s
  bulk import gives it, so re-importing a hire through either path updates
  one row.

This step belongs to the live import only. The `tpMatches.import` procedure
does not run it: `tools/import-tp`'s bulk run imports star hires in its own
step before it imports the match files.

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
  reported — a bracket-traced outcome (e.g. a tied semifinal, resolved by
  checking which team played in, and thus won, its final) settles once the
  later-stage match is imported, not before. A tied semifinal imported
  before its final is recorded as a draw in the meantime, since that is what
  TP's own `scoreResume.winner` reports for it, and is corrected once the
  final is imported and the competition's outcomes are re-resolved.

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

None of the entry points throw for an import problem; every failure is one
`ImportError` in the result.

| Failure                                                                                                                                                                           | Reported in                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Match request or parse failure                                                                                                                                                    | `match`                                     |
| Match not completed (no recorded result); live only                                                                                                                               | `match`                                     |
| Team import failures (home or away); live only                                                                                                                                    | `homeTeam`/`awayTeam`, as for a team import |
| `importMatchTeams` only: match request or parse failure, or an unexpected error                                                                                                   | `match`                                     |
| Hiring team era unresolved, star position or player upsert failure, characteristics lookup failure, missing catalog characteristics, or external-system upsert failure; live only | `starPlayerHires`                           |
| Tournament or fixture-list request/parse failure; live only                                                                                                                       | `competition`                               |
| Unknown era, no dated fixtures, or competition upsert failure (including a new competition matching no curated group, or several); live only                                      | `competition`                               |
| Competition not imported, team era unresolvable, unclassifiable bracket, or match upsert failure                                                                                  | `match`                                     |
| Team-link failure                                                                                                                                                                 | `participation`                             |
| Event upsert failure, or an unresolved player (non-fatal)                                                                                                                         | `events`                                    |
| Undecidable outcome                                                                                                                                                               | `outcome`                                   |
| A backfilled team's import, the link or the awards fail, after creating the competition; live only                                                                                | `participantsBackfill`                      |
| A backfilled match's fetch, team import or write fails, after creating the competition; live only                                                                                 | `matchesBackfill`                           |
| Settling the end date or computing the extra trophy awards fails, after creating the competition; live only                                                                       | `extraTrophyAwards`                         |

A stage whose prerequisite failed reports nothing imported.
