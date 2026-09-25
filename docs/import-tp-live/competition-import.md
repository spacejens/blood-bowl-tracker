# Competition import

`TpCompetitionImportService` (in `TpCompetitionModule`) imports one TP
competition: the competition itself, the teams registered to it, and its
trophy awards. Its two callers are
`TpLiveCompetitionImportService.importCompetition(...)`, below, and the
`tpCompetitions.import` procedure.

## Importing a competition live

```ts
const result = await tpLiveCompetitionImportService.importCompetition({
  tournamentSlug: 'tloegbbl-sasong-30',
  externalSystemName: 'TP',
});
```

- `tournamentSlug`: the tournament, as named in TP's frontend URLs.
- `era`: optional. The era to import the competition and its teams under,
  by name. When given, every registered team and the competition itself are
  imported under it. When omitted, each registered team resolves its own era
  exactly as a plain live team import does (see
  [index.md](index.md#era-resolution)), and the competition is imported
  under the one era every team that resolved an era agrees on. If the teams
  resolved different eras, or none resolved one (including a competition
  with no registered teams), the competition stage fails with an error
  saying so, and the competition, its participation links and its trophy
  awards are not imported; the teams already imported stay imported. Pass
  the era explicitly to force such an import through.
- `externalSystemName`: required. The name TP's external system is
  registered under, passed to every team import and the competition import.
  Keep it in sync with the bulk import's configured name.
- `session`: optional. A `packages/scrape-tp` session to fetch through, so
  every request of the import is paced as one visit. A fresh session is
  started when omitted.

The import runs these stages in order. Each is reported in the result even
when an earlier one fails:

1. **Fetch the tournament and every phase/round fixture list**, the same way
   a live match import does. This gives the competition's name and TP id,
   its category ids, and every dated match's date.
2. **Fetch the inscriptions** of each category, the way TP's players page
   does, giving the TP roster id of every registered team.
3. **Import each registered team live**, under the given era (or, with none
   given, each resolving its own), through the same session, with the
   ordinary live team import (see
   [index.md](index.md#importing-a-team-live)). A team that cannot be
   imported is reported and the rest of the import carries on.
4. **Settle the competition's era**: the given one, or — with none given —
   the one era the imported teams agree on. With no agreed era the import
   stops here and reports it in `competition`.
5. **Fetch the awards**, the way TP's awards page does. An unfinished
   competition has none yet. That is not an error, and nothing is awarded.
6. **The shared core**, below.

A failed inscriptions fetch still imports the competition, with no teams
linked and no awards — when `era` is given explicitly; without one, a failed
inscriptions fetch leaves no teams to resolve an era from, so the
competition stage fails instead (see the zero-teams row in the Failures
table below). A failed awards fetch still imports the competition and links
its teams. Either failure is reported in its own stage.

The result carries `competition`, `participation` and `trophyAwards` (one
`ImportResult` each), `teams`: one live team import result per registered
team, with its `rosterId`, and `era`: the era the competition was imported
under — the given one or the one the teams agreed on — or undefined when the
import stopped before settling one.

A team whose coach was never imported before is still imported: the live
team import creates the coach from the roster's own coach id and name, with
no NAF number (see [index.md](index.md)).

## The shared core

`TpCompetitionImportService.importCompetition` runs three stages over
already-fetched, already-parsed input:

- **Competition**: upserted by its TP id. A new competition gets its era by
  name, and its type and dates from its matches' dates. The dates are
  classified by the same ≤ 3-day cup rule as
  [match import](match-import.md). An already-imported competition has its
  era, type and dates overwritten from this call's data, and its name and
  external id kept in sync (a live match import's own upsert leaves the
  stored era, type and dates alone). It never sends a competition group, so
  a competition not already curated by `tools/import-manual` cannot be
  created.
- **Participation**: each registered roster is resolved to its team, and
  then to that team's era in the competition's era. Every resolved team era
  is added to the competition (`competition_teams`). The sync only ever
  adds, so re-importing is harmless, and teams already linked by imported
  matches stay linked.
- **Trophy awards**: each award is recorded as a team award for its winning
  team, which must be one of the linked participants. The trophy is resolved
  by its TP external id `${disambiguator}-${groupName}` and never created.
  The disambiguator is the award's `name` when present (Best Stunty, Wooden
  Spoon) and its numeric `awardType` otherwise. `groupName` is the
  competition's curated group. See
  [import-tp's awards format](../import-tp/file-format-awards.md) for the
  catalog.

A stage whose prerequisite failed is not attempted and reports nothing
imported. Nothing is linked without a competition, and no award is recorded
when the team link failed.

## The tpCompetitions.import procedure

`tools/import-tp`'s bulk run calls this once per competition directory, so
a bulk import and a live one import a competition through the same core.
Input:

```ts
{
  tournament: { id: number, name: string },
  playedDates: Date[],            // ISO strings on the wire
  era: string,
  participantRosterIds: number[], // every registered team's TP roster id
  awards: TpCompetitionAward[],   // { id, awardType, name?, rosterId }; empty when none yet
  externalSystemName: string,
}
```

Output: `{ competition, participation, trophyAwards }`, one `ImportResult`
per stage.

## Failures

Neither entry point throws for an import problem. Every failure is one
`ImportError` in the result.

| Failure                                                                                          | Reported in                                           |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Tournament or fixture-list request/parse failure; live only                                      | `competition`; nothing else is attempted              |
| Unknown era, no dated matches, or competition upsert failure (including a missing curated group) | `competition`                                         |
| Inscriptions request/parse failure; live only                                                    | `participation`; no team is imported or linked        |
| Team import failure; live only                                                                   | that team's entry in `teams`, as for a team import    |
| No era given, and the teams' eras disagree or none resolved one; live only                       | `competition`; no participation or awards imported    |
| Registered team not imported, or with no team era in the competition's era                       | `participation`; the other teams are still linked     |
| Team-link failure                                                                                | `participation`; no award is recorded                 |
| Awards request/parse failure; live only                                                          | `trophyAwards`; the competition imports with none     |
| Competition group not in the curated catalog                                                     | `trophyAwards`                                        |
| Award for a team that is not a linked participant                                                | `trophyAwards`                                        |
| Unresolvable trophy key                                                                          | `trophyAwards`, once per key; further rows summarized |
| Trophy award upsert failure                                                                      | `trophyAwards`                                        |
