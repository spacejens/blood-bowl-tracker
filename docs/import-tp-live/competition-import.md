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
  externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
});
```

### Options

- `tournamentSlug`: the tournament, as named in TP's frontend URLs.
- `era`: optional. The era to import the competition and its teams under, by name.
  - When given, every registered team and the competition itself are imported under it.
  - When omitted, each registered team resolves its own era exactly as a plain live team import does (see [index.md](index.md#era-resolution)), and the competition is imported under the one era every team that resolved an era agrees on.
  - If the teams resolved different eras, or none resolved one (including a competition with no registered teams), the competition stage fails with an error saying so, and the competition, its participation links and its trophy awards are not imported; the teams already imported stay imported.
  - Pass the era explicitly to force such an import through.
- `externalSystemName`: required. The name TP's external system is registered under, passed to every team import and the competition import. Callers pass `TP_EXTERNAL_SYSTEM_NAME` from `packages/domain-enums`, the name the bulk import registers TP data under.
- `session`: optional. A `packages/scrape-tp` session to fetch through, so every request of the import is paced as one visit. A fresh session is started when omitted.
- `forceMatchBackfill`: optional, default false. Backfill every completed match of the competition even when it was already imported (see stage 7 below).
  - `/importtp` sets it for a competition's scores page.
  - The TP feed's trophy announcement uses it too.
  - The feed's retry of an import whose match backfill a TP block interrupted uses it too: that block's `TpBlockedError` has `backfillInterrupted` set, which a block met before step 7 does not.

### Stages

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
7. **Backfill the completed matches** — only when the shared core newly
   created the competition, or `forceMatchBackfill` is set, and the
   competition was imported. Every bracket match with a recorded result is
   imported one at a time through the same session, exactly as a live
   match import imports its own match (fetch it, import both teams, write
   it), reusing the bracket already fetched in step 1. Matches not played
   yet are skipped. Re-importing an already-imported match is harmless.
8. **Award the extra trophies**: only once the competition is imported and
   finished, meaning step 5 returned at least one award.
   - The trophies TP does not record itself (`max_count`, `max_spp_sum` and `career_threshold` rules) are computed by game-data's `MissingTrophyAwardsService`, the same service `tools/import-tp`'s bulk run calls at its end.
   - This runs after step 7 and is skipped, with one error in `extraTrophyAwards`, when step 7 reported errors: a trophy already awarded is never recomputed, so an award computed while a match is missing would stay wrong.
   - When no backfill ran in this import (a plain re-import of an existing competition), the step relies on the matches imported earlier, and cannot tell whether any is missing.
   - The step is idempotent, so re-importing is harmless.
9. **Settle the players' SPP**: once the competition is imported, every
   registered team's players, and every player the match backfill imported
   (including players seen only in backfilled match snapshots and teams not
   in the inscriptions), get their `spp_total` and `spp_adjustment`
   from game-data's `SppAdjustmentsService.syncReportedAdjustments`, as in
   a live match import (see
   [match-import.md](match-import.md#importing-a-match-live)). It runs last,
   after step 7: the match backfill re-imports every team's roster, which
   writes TP's raw total back. It runs even when no backfill ran, since step
   3 re-imported the rosters too. A failure is reported in `sppAdjustments`
   and never fails the import. A player of a backfilled match whose events
   failed to import is not settled, from any source, since the
   imported-event sum is incomplete; a later successful import settles
   them, and errors in other stages do not hold settling back. A backfilled
   match that throws, or whose team import fails, names no players to leave
   out. When the era is unresolved or the competition upsert fails, the
   teams already re-imported are left unsettled.

### Fetch failures

- A failed inscriptions fetch still imports the competition, with no teams linked and no awards — when `era` is given explicitly; without one, a failed inscriptions fetch leaves no teams to resolve an era from, so the competition stage fails instead (see the zero-teams row in the Failures table below).
- A failed awards fetch still imports the competition and links its teams.
- Either failure is reported in its own stage.
- Neither counts as an unfinished competition: with the awards unknown, no extra trophies are awarded and a stored end date is left exactly as stored, neither reset nor written.

### Result

The result carries:

- `competition`, `participation` and `trophyAwards` (one `ImportResult` each).
- `teams`: one live team import result per registered team, with its `rosterId`.
- `era`: the era the competition was imported under — the given one or the one the teams agreed on — or undefined when the import stopped before settling one.
- When step 7 ran, `matchesBackfill`: one `ImportResult` counting the matches written and holding every backfilled match's errors.
- `extraTrophyAwards`: one `ImportResult` counting the awards step 8 created (nothing imported when it did not run, and one error when it was skipped because step 7 reported errors).
- `sppAdjustments`: one `ImportResult` counting the players step 9 settled (nothing imported when the competition was not imported).

A team whose coach was never imported before is still imported: the live
team import creates the coach from the roster's own coach id and name, with
no NAF number (see [index.md](index.md)).

## The shared core

`TpCompetitionImportService.importCompetition` runs three stages over
already-fetched, already-parsed input.

### Competition

- **Competition**: upserted by its TP id.
  - **New competition**
    - A new competition gets its era by name, and its type and start date from its matches' dates.
  - **End date**
    - Its end date is written only once the competition is finished, meaning the call's awards are non-empty: the latest played date, or a later stored end date.
    - Until then a new competition's end date is null, and an overlay resets a stored end date to null, even when the call has no new match dates, so a competition stored with an end date but no awards is corrected by its next full import.
    - A call whose awards are unknown (the live import's awards or inscriptions fetch failed) is neither: a new competition still gets a null end date, but a stored one keeps its end date exactly as stored.
    - A finished overlay with no dated matches has nothing to derive an end date from and leaves it as stored.
  - **Type**
    - The matches' dates are classified by the same ≤ 3-day cup rule as [match import](match-import.md).
  - **Overlay**
    - An already-imported competition has its era, type and start date overwritten (and its end date, when finished) from this call's data.
    - With no new match dates only the end date reset applies.
    - The competition's stored name is kept (TP's raw name never overwrites it) and its external id kept in sync (a live match import's own upsert leaves the stored era, type and dates alone).
  - **Group**
    - A new competition's group is found by matching its raw TP name against every curated group's `namePattern` (see [docs/import-manual](../import-manual/index.md#competition-groups)); exactly one match gives it:
      - that group
      - a name continuing the group's numbering (`"<group> <n>"`, where `n` is the trailing number of TP's raw name when it has one no existing competition in the group already carries, so out-of-order imports keep their real number; otherwise the highest existing number + 1, or the bare group name for a group with no competition yet)
      - the type every existing competition in the group shares
    - No match, or several, skips the competition with an error saying which, and it needs curating by hand.
    - On both create and overlay, a type the group's competitions all share wins over the ≤ 3-day date rule, which applies only when they disagree or there are none.
  - **Created flag**
    - This stage also reports whether the competition was newly created; the live import reads that to decide on step 7, and the `tpCompetitions.import` procedure drops it.

### Participation and trophy awards

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
  tournament: TpCompetitionTournament, // { id, name }
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
`ImportError` in the result, except a TP block, which the live import throws
as `TpBlockedError` and which stops it at once, mid-backfill included (see
[Failures in the index](index.md#failures)).

| Failure                                                                                                                             | Reported in                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Tournament or fixture-list request/parse failure; live only                                                                         | `competition`; nothing else is attempted              |
| Unknown era, no dated matches, a new competition matching no curated group's name pattern or several, or competition upsert failure | `competition`                                         |
| Inscriptions request/parse failure; live only                                                                                       | `participation`; no team is imported or linked        |
| Team import failure; live only                                                                                                      | that team's entry in `teams`, as for a team import    |
| No era given, and the teams' eras disagree or none resolved one; live only                                                          | `competition`; no participation or awards imported    |
| Registered team not imported, or with no team era in the competition's era                                                          | `participation`; the other teams are still linked     |
| Team-link failure                                                                                                                   | `participation`; no award is recorded                 |
| Awards request/parse failure; live only                                                                                             | `trophyAwards`; the competition imports with none     |
| Competition group not in the curated catalog                                                                                        | `trophyAwards`                                        |
| Award for a team that is not a linked participant                                                                                   | `trophyAwards`                                        |
| Unresolvable trophy key                                                                                                             | `trophyAwards`, once per key; further rows summarized |
| Trophy award upsert failure                                                                                                         | `trophyAwards`                                        |
| A backfilled match's fetch, team import or write fails; live only                                                                   | `matchesBackfill`; the other matches still import     |
| Computing the extra trophy awards fails; live only                                                                                  | `extraTrophyAwards`; TP's own awards stay recorded    |
| The match backfill reported errors, so the extra trophy awards are skipped; live only                                               | `extraTrophyAwards`; nothing awarded                  |
