# TP source file format — working notes

Temporary notes on TP's JSON API response mirror, used to coordinate between
development sessions. **Remove an entry once its detail is fully encoded in
code** — the code is the source of truth at that point.

## General

- Layout: `<dataDir>/<era subdirectory>/<competition subdirectory>/*.json`.
  Era subdirectory names are TP's own slugs (e.g. `fourth-era`,
  `second-dungeon-bowl-era`), not necessarily the era's display name — mapped
  via config (`import-tp-config.json5`'s `league.eras[].dataSubdir`).
  Competition subdirectory names are TP's `nameNormalized` slug for the
  tournament (see below) and can be messy: observed examples include
  `-ogretoberfest-12--` (stray leading/trailing hyphens) and
  `tournament_..._clasifications?type=COACH.json`-style filenames that embed a
  literal `?type=COACH` query string (preserved verbatim from the mirrored
  API URL, not a real query string on disk).
- Files are JSON (unlike BBL's HTML), one JSON document per file. Encoding is
  UTF-8.
- Filename convention: `<type>_<rest>.json`, where `type` is the text before
  the first `_` (the whole basename minus `.json` when there's no `_`). Types
  seen in the reference dataset: `match`, `rosters`, `tournament`, `awards`,
  `inscriptions`.
- `tournament_*` files have a base form and several suffix variants that
  share the same `tournament_` prefix but carry additional detail for one
  tournament: `tournament_<slug>.json` (base — the only variant parsed so
  far), `tournament_<slug>_coach-stats.json`, `tournament_<slug>_team-stats.json`,
  `tournament_<slug>_lineup-stats.json`, `tournament_<slug>_statistics.json`,
  `tournament_<slug>_news.json`, `tournament_<slug>_clasifications?type=COACH.json`,
  `tournament_<slug>_phases?type=COACH.json`. Since TP slugs use hyphens, never
  underscores, the base file is distinguished from its variants by a regex
  requiring no further `_` after the `tournament_` prefix
  (`isBaseTournamentFile` in `tp-source-reader.ts`:
  `/^tournament_[^_]+\.json$/`).

## Entity identifiers

- TP's own numeric ids (`tournament.id`, `match.matchId`, roster `id`, etc.)
  are internal to TP and not currently used as external ids for anything —
  era and rule-set identity are fully operator-config-supplied (see
  [index.md](./index.md)), since TP's data carries no human-readable name for
  either.
- `tournament.ruleSet` (and the same field mirrored on `match` and `rosters`
  bodies) is an **opaque numeric code** with no name anywhere in the API
  response — e.g. `20` for `third-era`, `21` for `second-dungeon-bowl-era`,
  `25` for `fourth-era` in the reference dataset, all internally consistent
  within their era's directory. TP's own meaning for these codes is unknown;
  the code is used only as a cross-check that every tournament under one
  era's directory agrees (`TpErasImportService`'s consistency check), never
  as the source of a rule-set's display name.
- Roster bodies (both `rosters_<id>.json` and the `roster` object nested in
  `match`/`inscriptions` files — see below) include a `teamRace` field that
  embeds a rule-set-looking suffix, e.g. `"Snotling_BB2025"`,
  `"Khemri_BB2025"`. Parsed as `teamRaceCode` (see roster section below) and
  used to resolve each team's/position's race via `raceIdsByTeamRaceCode`
  during races/teams/positions import, but note the embedded suffix does NOT
  necessarily match this project's own rule-set names (compare to the opaque
  `ruleSet` numeric code above, which is the field actually used for
  cross-checking).

## `tournament_<slug>.json` (base file — parsed)

Fully handled in code: `packages/parse-tp`'s `parseTournament()` extracts
only `{ id: number, name: string, ruleSet: number }`. The body carries much
more — `nameNormalized` (the slug used for the competition subdirectory
name), `country`/`locality`/`region`/`address`/`postalCode`, `creationDate`,
`state`, `isNaf`, `isSpecialist`, and a `categories[]` array whose nested
`phases[]` entries carry the tournament's full Blood Bowl ruleset
configuration (`pointsWin`/`pointsDraw`/`pointsDefeat`, `mvpCandidates`,
`weatherAvailables`, `spirallingExpenses`, `expensiveMistakes`, and dozens
more) — none of this is parsed yet; competition import consumes only the
`{ id, name, ruleSet }` already extracted, so it remains out of scope until a
future sub-issue needs it.

## `match_<id>.json` (play date and name parsed)

`packages/parse-tp`'s `MatchParserService.parse()` extracts
`{ id: number, playedDate: Date, name: string }` — mapping `matchId` to `id`,
building `name` from `group.phase.roundName` title-cased plus `round` (e.g.
`"Round 3"`, `"Day 2"`; only `"ROUND"` and `"DAY"` roundNames appear in the
dataset, but the field is treated as an arbitrary string), and resolving
`playedDate` with a three-step fallback: `scoreResume.startInstant` (a
completed match's own recorded start time — the most direct "actually played"
signal TP exposes — see below) when present and non-null, else `scheduledDate`
(the agreed play date, and the best available signal for a match with no
scoreResume yet), else `createdInstant` as a last resort. `createdInstant` is
only a record-setup timestamp (when the match slot was created, e.g. at
schedule generation) and can predate the actual play date by months — it is
deliberately not an earlier fallback. TP competition import uses these dates to
classify a competition as a cup or season by their span. `TpMatchesImportService`
then imports each match as a `Match` row linked to its competition (via the
directory scan, since a match file carries no tournament id — see below),
carrying only a TP external id (the stringified `matchId`); match names are not
unique, so they are never used as an external id. The parser also reads
`inscriptionLocal.roster.id` / `inscriptionVisitor.roster.id` (the home/away
team roster ids); `TpTeamParticipationImportService` resolves these to team-era
ids and re-upserts each match with its `match_teams`, and derives each
competition's `competition_teams` from which roster files appear under its
directory.

### Match category classification (`phaseType`/`phaseOrder`/`round`/`winner`)

TP never names a match's stage in text — `group.phase.roundName` only ever
holds `DAY`/`MATCHDAY`/`ROUND` across all local data. The only stage signal is
numeric: `group.phase.type`, `group.phase.order`, and the match's own
top-level `round`. `MatchParserService.parse()` additionally exposes these as
`phaseType`/`phaseOrder`/`round` on `TpMatch`, plus `winner` (`'home'`/
`'away'`/`'draw'`/`undefined`, mapped from `scoreResume.winner`). Decoding
this into a `MatchCategory` is `tools/import-tp`'s
`TpMatchCategoryService.classify()`'s job — see its doc comment for the full
algorithm. Summary, with the evidence behind it:

- `phaseOrder === 1` is always the main phase (regular season, or a cup's
  pool play) — `normal`, for both `season` and `cup` competitions. Every
  single-phase competition in the local data (`chaos-cup-8`,
  `ogretoberfest-11/12/13`, `dungeon-bowl-season-2/3/4`) only ever has this
  tuple, confirming there's no cup-final signal in the current fixtures.
- For a `season` competition, `phaseType`'s _literal value_ (`30` vs `110` in
  the fixtures) is **not** a stable stage signal — which numeric phase hosts
  which stage flips between seasons (`tloegbbl-sasong-28` is the local
  example: its playoff matches split `4`+`2` across `(30, 2, 70)`/`(110, 3,
70)`, the reverse of every other season's `2`+`4`). The stable signal is
  each match's `(phaseOrder, round)` pair's ascending _position_ among all of
  its competition's non-main-phase matches — that always matches
  chronological (`playedDate`) order, confirmed against real `startInstant`
  timestamps.
- Sorting a season's non-main matches by `(phaseOrder, round)` yields exactly
  2 or 3 stages of 2 matches each, developer-confirmed against the real
  `tLoEGBBL` playoff format:
  - **6 non-main matches** (3 stages): stage 1 = `season_qualifier`, stage 2 =
    `season_semi_final`, stage 3 = the terminal (final + bronze) stage.
  - **4 non-main matches** (2 stages, no qualifying round that season): stage
    1 = `season_semi_final`, stage 2 = the terminal stage.
  - Any other non-main match count, or a stage without exactly 2 matches, is
    an unanticipated shape and the classifier throws rather than guessing.
- The terminal stage's two matches share an identical `(phaseOrder, round)`
  tuple — nothing in the data tells them apart directly. They're split by
  tracing which two teams _won_ the semifinal stage's two matches (via
  `winner`/`homeTeamTpId`/`awayTeamTpId`): the terminal match pairing the two
  semifinal winners is `season_final`; the one pairing the two semifinal
  losers is `season_bronze`. Verified by hand against real team ids and
  scores for every season competition in the local data. One fixture
  (`tloegbbl-sasong-29`) has a drawn semifinal (`winner: 'draw'`) — resolved
  transitively, since the _other_ semifinal's confirmed winner can only
  appear in one of the two terminal matches, making that one the final and
  the other bronze regardless of the drawn semifinal's own score. If both
  semifinal matches were ever drawn in the same season, there'd be no
  confirmed winner to anchor that inference on — the classifier throws rather
  than guessing (never observed locally).
- A `cup` competition match with `phaseOrder !== 1` has no confirmed mapping
  (no local cup has more than one phase) and throws.

This mapping was derived directly from the TP fixture data itself, not by
cross-referencing the BBL mirror as originally planned: the local BBL mirror's
newest recorded match result is 2023-06-10, while every TP competition that
needs this classification (`tloegbbl-major-season-25` onward) starts on or
after 2023-06-28 — after the mirror's data ends. There is no BBL data to
cross-reference against for any of these competitions.

`matchEvents[]` — TP's per-roll event log for the match — is decoded by
`packages/parse-tp`'s `parseMatchEvents()` into `TpMatchEvent[]`, keyed by the
raw numeric `matchEventType` code. **Modeled codes**: `3` completion, `4`
touchdown, `5` interception, `25` deflection, `31` foul, and `46` successful
landing are all structurally identical single-actor action events
(`lineUpId`, acting `rosterId`); `7` mvp_award is the same shape (`lineUpId`
of the awarded player, their team's `rosterId` — occurs essentially exactly
once per team per completed match); `32` sent off is the same raw shape again
but consequence-side (the player sent off, not an actor earning credit); `6`
casualty_caused (`lineUpId`, ACTING `rosterId`, optional `turnNumber` — see
below) is the action of a player breaking armor; `8` injury (`lineUpId`,
victim `rosterId`, optional `turnRosterId` — the acting team's roster id when
present — optional `turnNumber`, and `injuryType`) is the roll reporting the
victim and severity; the administrative rolls `10` weather, `11` inducements
(incl. any hired star players, `extraData.starPlayers[]`), `12` winnings,
`13` fan factor, `14` expensive mistake, `15` journeyman signing, `20`
concession, `23` prayers to Nuffle, `26` dedicated fans, and `42` secret
objective. **Skip-listed codes** — dropped unconditionally, along with any
unrecognized code, so new/unmapped TP codes never crash the import: `0, 1,
18, 19, 27` — these are structural markers or per-roll noise with no useful
modeled payload (e.g. code `27`, "player assigned to line-up", is a
structural row, not a modeled roll). A `None` `injuryType` is still returned
by the parser and is now a real, imported event (a genuine "Badly Hurt"
result — see below).

`tools/import-tp`'s `TpMatchEventsImportService` turns each decoded event
into zero, one, or two `UpsertMatchEvent`s (see
[index.md](./index.md#architecture)). Unlike BBL, which correlates
separately scraped action/consequence occurrences, TP embeds the
acting/victim player and team directly on the event for every kind EXCEPT
casualties — a legitimate, confirmed exception to the original "no
correlation needed" design, since a code-6 (`casualty_caused`) and its code-8
(`injury`) are logged as two independent events with no shared id (see
below). A touchdown becomes an `actionType: 'touchdown'` event scoped to the
scorer; completion, interception, deflection, foul, mvp_award, and successful
landing are all resolved the same way, crediting the acting player and their
team; sent off is consequence-side, crediting the sent-off player and their
team. Sent off is deliberately NOT correlated with a preceding foul by the
same player — in real data, only 58% of sent-offs pair with a nearby same-
player foul within 30s; the rest have no nearby foul at all (Blood Bowl's
other sent-off trigger, e.g. an automatic ejection after using a Secret
Weapon player such as "Fungus the Loon", already seen in this dataset's
hired-star-player fixtures) — so the two are modeled as fully independent,
standalone events.

An injury's `injuryType` maps to a `consequence_type` via:

| `injuryType`     | `consequence_type`  |
| ---------------- | ------------------- |
| `None`           | `badly_hurt`        |
| `MissNextGame`   | `miss_next_game`    |
| `NigglingInjury` | `niggling_injury`   |
| `Dead`           | `death`             |
| `AV`             | `stat_reduction_av` |
| `ST`             | `stat_reduction_st` |
| `MA`             | `stat_reduction_ma` |
| `PA`             | `stat_reduction_pa` |
| `AG`             | `stat_reduction_ag` |

`None` used to be skipped entirely (treated as "no injury happened"); it is
in fact a genuine Badly Hurt result and is now always imported.

`matchEvents[].starPoints` — the [Star Player Points](../glossary.md#star-player-points-spp)
TP itself says this event awarded its acting player — is carried on every
modeled action/consequence event kind (completion, touchdown, interception,
deflection, foul, mvp_award, successful landing, sent off, casualty_caused,
and injury via its paired actor), though TP omits it even on those kinds
sometimes and it is `undefined` on every administrative kind. `0` is a real
award of nothing, not "no data" — absent and `0` are different answers, so
the field is optional rather than defaulted. It is imported verbatim onto
`match_events.spp_value` rather than recomputed from the standardised
`spp_award_values` table: TP's figure already reflects race-specific and
random-event rules the table does not model, and the observed data contains
legitimate non-standard values (a 5-point touchdown, a 3-point casualty).

### Casualty/injury correlation (code 6 ↔ code 8)

A code-6 `casualty_caused` event is the ACTION of a specific player breaking
armor; a code-8 `injury` event is the roll reporting the VICTIM and severity.
They are TP's one exception to "no correlation needed": the specific
attacker can only be recovered by pairing the two events after the fact,
implemented in `tools/import-tp/src/match-events/tp-match-events-correlation.ts`
(mirroring where BBL's action/consequence correlation lives), computed once
per match before its events are dispatched.

Wall-clock proximity was considered and explicitly rejected as the pairing
key: TP's event registration is asynchronous, so a code-8 can be logged (and
timestamped) before its corresponding code-6, and an unrelated injury can
also simply occur shortly after a casualty-causing action elsewhere in the
match. Real data confirms `turnNumber` equality is a far more reliable,
order-independent key: of code-6 events with at least one valid-direction
candidate injury (`injury.turnRosterId === casualty.rosterId` and
`injury.rosterId !== casualty.rosterId`), 86.4% (1329/1538) share the exact
same `turnNumber` as that candidate. Pairing therefore requires
`turnNumber` equality as a hard condition — never wall-clock ordering — with
nearest-by-`instant` used only as a tiebreaker among same-turn candidates,
and each code-8 consumed by at most one code-6. A code-6 with no
same-`turnNumber` candidate stays unpaired rather than being force-matched
across turns.

A same-turn candidate is only eligible for pairing if its `instant` is
within 120 seconds of the casualty's — a `MAX_PAIRING_DELAY_MS` cutoff.
Running the pairing algorithm with no cutoff at all against the real local
fixture corpus, the resulting delay distribution has no sharp cliff (a
smooth long tail out to 1043s), and the delay does not distinguish
genuinely ambiguous (multi-candidate) pairings from unambiguous
(single-candidate) ones — both groups show nearly identical distributions.
120s was chosen because it captures 97.2% of real pairs while bounding the
long tail; a candidate whose `instant` can't be parsed (diffs to `NaN`) also
fails this cutoff and is treated as ineligible, since an unmeasurable delta
can't be confirmed to be within the window.

A casualty erased by an apothecary (or similar effect) never gets a code-8
counterpart at all — the code-6 action still fired (the player still gets
credit), but there is genuinely no injury consequence to pair it with; it is
imported as a standalone `actionType: 'casualty'` row (severity unknown, no
injury to report it). An unpaired code-8 is likewise normal and expected
(e.g. a player falling down on their own, or a random event not tied to any
attacker) — not an error case.

When a code-8 IS paired to a code-6, the resulting row carries both
`actionType` and `consequenceType` at once: the consequence side as above,
and the action side crediting the specific acting player and team, with
severity bucketed the same way `tools/import-bbl` already buckets its own
casualty severities:

| `injuryType` bucket                                            | `actionType`     |
| -------------------------------------------------------------- | ---------------- |
| `None`                                                         | `badly_hurt`     |
| `MissNextGame`, `NigglingInjury`, `AV`, `ST`, `MA`, `PA`, `AG` | `serious_injury` |
| `Dead`                                                         | `death`          |

When a code-8 is NOT paired but its `turnRosterId` differs from the victim's
`rosterId` (opponent-caused per TP's turn-owner field, but the specific
player couldn't be pinned down — e.g. a cross-turn logging quirk), the row
falls back to team-only credit at the same severity bucket. A `turnRosterId`
equal to the victim's roster (or absent), with no code-6 pairing, means the
injury was self-inflicted (e.g. a failed dodge) or otherwise unattributable,
so only the consequence side is emitted. This dual-role-on-one-row shape is
the same deliberate choice as before (avoiding a BBL-style two-row
correlation for most cases); the `match_events` CHECK constraint
accommodates it (see below).

Every administrative event sets exactly one typed payload column (e.g.
`weatherType`, `inducementsCost`, `inducementsFromTreasury`, `winnings`,
`fanFactor`, `journeymenCount`, `expensiveMistake`, `dedicatedFans`,
`secretObjective`, `prayersToNuffle`); "both-sides" events (winnings, fan
factor, dedicated fans) emit up to two records, one per team, with
`-home`/`-away`-suffixed external ids. Every event's external id is
`tp-<tpEventId>` (or its suffixed variant), synthesized from
`matchEvents[].id`.

Most administrative events map onto `actionType` (renamed from the roll
mechanic to the outcome, e.g. `inducements`, `winnings`, `fan_factor`,
`journeymen_signings`), but two are classified differently:

- **Weather** (`10`) has no actor and no consequence recipient — it's a
  neutral, match-level fact — so it's carried via a separate `eventType`
  column (`'weather'`, currently its only value) instead of `actionType`.
  `match_events`'s CHECK constraint requires `eventType` to be set alone
  (with both `actionType`/`consequenceType` null) XOR at least one of
  `actionType`/`consequenceType` to be set (with `eventType` null) — never a
  mix of `eventType` and the other two. `weatherType` is decoded to a named
  condition (the `game_data.weather_type` enum) before import, with `'unknown'`
  as a permanent catch-all for codes not yet mapped.

  **Weather decoding is table-aware (observed 2026-07, Major Season 30
  onwards).** The code-10 event's `extraData` carries a `weatherTable`
  alongside `weatherType`. It was present but always `0` in every earlier
  era's data, so the code alone was enough; Major Season 30 introduced
  `weatherTable: 13`. Table 13's `weatherType` codes are NOT a disjoint new
  range — two of its five observed codes (`40`, `104`) collide with numbers
  table 0 already uses for different conditions (`40` is `pouring_rain` on
  table 0 but `very_sunny` on table 13; `104` is `perfect_conditions` on both,
  coincidentally). This collision is exactly why the lookup had to become
  table-aware rather than code-only: a code-only lookup would have actively
  mis-decoded these two as their table-0 meanings, not merely failed to
  decode them. Because the same number can name different conditions on
  different tables, `packages/parse-tp`'s `WeatherTypeService.decode(table,
code)` takes both and looks them up in `weatherTypeByTableAndCode`, which
  keys table first. An event with no `weatherTable` at all (the oldest data)
  is treated as table `0`.

  All five table-13 codes observed in Major Season 30's downloaded data are
  now mapped, derived by grouping code-10 events by `weatherType` and cross-
  referencing the `rollLocal`/`rollVisitor` 2d6 sum against the classic Blood
  Bowl weather table (each code's observed sums form an exact, non-overlapping
  partition of the 2-12 range): `40` → `very_sunny` (sum 3), `104` →
  `perfect_conditions` (sums 4-10), `131` → `sweltering_heat` (sum 2), `132` →
  `pouring_rain` (sum 11), `133` → `blizzard` (sum 12). A table-13 code never
  observed stays unmapped and decodes to `'unknown'`, exactly as prior eras'
  rare codes do.

- **Dedicated fans** (`26`) is a consequence (the resulting fan-count
  change), not an action, so it's carried via `consequenceType:
'dedicated_fans'` / `consequenceTeamEraId` rather than `actionType`. A
  side whose modifier is `0` (no change) is skipped entirely, so this event
  can now emit zero, one, or two records instead of always exactly two.

Two facts the match-event model can record are absent from TP's data, so the
corresponding columns stay null for TP-sourced events:

- **How a casualty was prevented.** No casualty (code 6) or injury (code 8)
  event carries any apothecary or regeneration signal. Apothecaries appear
  only away from the casualty itself: `inscription*.roster.apothecary`, a
  boolean saying the team _has_ one, and a `WanderingApothecaries` entry in a
  code 11 inducements roll's `common[]`, saying one was hired. Neither says
  whether it was used on a given casualty, and regeneration has no
  representation at all. An apothecary-erased casualty is only inferable as an
  unpaired code 6 (see the casualty/injury correlation section above).
- **An unidentified participant's kind.** Every event references its
  participant by `lineUpId`, and journeymen, mercenaries and star players are
  all imported as real player rows, so TP has no name-only or unidentified
  participant to describe in the first place. Journeymen appear as `lineUps`
  entries literally named `Journeyman` (plus event code 15), and star players
  are flagged `isStarPlayer` (plus the `starPlayers[]` array on code 11).

Both are things BBL's HTML mirror does state and TP does not — the reverse of
the usual direction, where TP is the richer source.

`secretObjective`'s payload is TP's own opaque identifier code for _which_
secret-objective card was drawn — not a count of objectives completed. The
same roster can have multiple `secret_objective` events in one match with
different, non-sequential values, and the same value can recur across
different matches for different rosters.

Notable remaining fields seen: `matchId`, `state`, `statePostMatch`,
`createdInstant`, `ruleSet`, `weatherTable`, `round`, `order`,
`turn { current, half, ... }`,
`inscriptionLocal.roster { id, lineUps, ... }` /
`inscriptionVisitor.roster { id, lineUps, ... }` (the home/away teams — each
side's roster `id` is parsed into `homeTeamTpId`/`awayTeamTpId`, and its
`lineUps[]` — a per-match snapshot of that side's roster, same shape as the
standalone roster file's own `lineUps[]` — is parsed into
`homeRosterPlayers`/`awayRosterPlayers`, see the players section below; the
rest of these nested roster bodies remains unhandled), `scoreResume
{ startInstant, finishInstant }`, and — importantly — `scheduledDate`/
`endScheduledDate`.
`scheduledDate` (and `scoreResume.startInstant`, which tracks it closely) is
the closest thing to "when the match was actually played" anywhere in TP's
data; there is no tournament- or era-level date-boundary field, so the era
date ranges configured in `import-tp-config.json5` were derived by scanning
every `match_*.json` under each era's directory for the earliest/latest
`scheduledDate` (a one-off manual step during initial config setup, not
something the import tool itself does).

## `rosters_<id>.json` (races, positions, teams and players parsed)

`packages/parse-tp`'s `RosterParserService.parse()` extracts `{ id, teamName,
teamRaceCode, raceName, coachTpId, positions, starPositions, players }`:

- `id` — TP's roster id, used as a TP external id for teams.
- `teamName` — the team's registered name, used as a Name external id for teams.
- `teamRaceCode` — extracted from the `teamRace` field (which carries a
  rule-set-looking suffix like `"Dwarf"` or `"Snotling_BB2025"`). This code
  is looked up in the `raceIdsByTeamRaceCode` map from `TpRacesImportService`
  to resolve which race row each team belongs to.
- `raceName` — extracted from `rosterMaster.name`, the display name for the
  race (e.g. `"Dwarf"`, `"Skaven"`, `"Snotling"`). Stable across every
  rule-set-variant code of the same logical race.
- `coachTpId` — extracted from `player.applicationUserId`, TP's stable coach
  account id. Looked up in `coachIdsByTpId` from `TpCoachesImportService` to
  resolve the team's coach.
- `positions` — extracted from `rosterMaster.lineUpMasters[]`, each entry
  becomes `{ tpPositionId: id, name: position }`. Positions are grouped by
  `(unified race, position name)` across all roster files, so one
  identically-named position across rule-set-variant codes of one logical race
  merges onto a single row, collecting every distinct `tpPositionId` as TP
  external ids (all in one upsert call). Positions carry no Name external id
  (position names are not race-unique).
- `starPositions` — extracted from `rosterMaster.starPlayersMasters[]` (named
  star players permanently embedded in a roster's line-up, as distinct from
  the star players hired for a single match via `inducements_roll` — see
  below), each entry becomes `{ tpPositionId: id, name: position }`, same
  shape as `positions`.
- `players` — extracted from `lineUps[]`, each entry becomes `{ id, name,
number, lineUpMasterId, rosterId, fallbackPositionName, isBigGuy }`. `id` is
  the per-instance line-up id that `matchEvents[].lineUpId` (see below)
  references; `lineUpMasterId` links back to the position template in
  `rosterMaster.lineUpMasters[]` or `starPlayersMasters[]` (the `positions`/
  `starPositions` fields above). `fallbackPositionName` and `isBigGuy` are
  carried straight from the entry's own `position`/`isBigGuy` fields
  (present on every `lineUps[]` entry, standalone or match-embedded) — see
  "Mercenary Big Guys" below for why.
- `lineUps[].starPlayerPoints` / `.totalStarPlayerPoints` — TP's own
  [Star Player Points](../glossary.md#star-player-points-spp) figures for
  this player, reported independently of `matchEvents[]`: `starPlayerPoints`
  for the match this line-up snapshot belongs to, `totalStarPlayerPoints`
  running across the player's career. Nothing in production code consumes
  them; they exist as a ground-truth cross-check that summing the imported
  per-event `starPoints` reproduces TP's own number (see
  `tp-spp-cross-check.spec.ts`). The spec that originally described this data
  expected it under a `squadMatches` field, but the real mirror carries it on
  `lineUps[]` instead — `squadMatches` is present on every match file but
  always empty.

**Races** (via `TpRacesImportService`) group by `raceName` (not code), so all
rule-set-variant codes of one logical race merge onto one row, each code kept
as a TP external id. Each upsert carries the display name as a Name external
id and every era any contributing roster was seen under.

**Positions** (via `TpPositionsImportService`) carry only TP external ids (one
per `tpPositionId` variant). After each upsert, the observed race/era
availability is recorded via `syncRaceEras`. Regular positions import with
`isStarPlayer: false`. `starPositions` (from `starPlayersMasters`) import
separately: grouped by name only (not race — the same named star player is
the same entity regardless of team), upserted with `isStarPlayer: true` and a
bare-name TP external id, matching the hired-star-player convention below so
both paths dedupe onto the same `Position` row. Their ids merge into the same
`positionIdsByTpPositionId` map the regular positions use — see "Embedded
roster star players" below for how this closes the gap that used to skip
these players.

**Teams** (via `TpTeamsImportService`) are keyed by roster `id` and `teamName`
(one TP and one Name external id). Their race resolves via `raceIdsByTeamRaceCode`
and their coach via `coachIdsByTpId`; a team whose race or coach cannot be
resolved is recorded as an error and skipped.

**Players** (via `TpPlayersImportService`) import every roster's `players`
entry: each resolves a team era (roster id + era, via
`teamErasByRosterId`) and a position (`lineUpMasterId`, via
`positionIdsByTpPositionId`). If that lookup fails but the player is flagged
`isBigGuy: true` (a mercenary Big Guy hire like "Giant", with no catalog
entry in either `rosterMaster` array at all — see "Still not handled" below
for why), it falls back to a reused `isStarPlayer: true` Position keyed by
the player's own inline `fallbackPositionName` (bare-name TP external id),
the same treatment a star player gets. A player whose team era can't be
resolved, or whose position can't be resolved even via that fallback, is
recorded as an error and skipped. Players carry only a TP external id (the
`lineUps[].id`) — no Name external id, since player names aren't guaranteed
unique. Returns `playerIdsByLineUpId`, consumed by match-event import to
resolve a `matchEvents[].lineUpId` to a player.

Player identity is sourced from BOTH `rosters_<id>.json`'s top-level
`lineUps[]` (a roster's CURRENT composition, as of when the local TP data
mirror was downloaded) AND each `match_<id>.json`'s
`inscriptionLocal.roster.lineUps[]` / `inscriptionVisitor.roster.lineUps[]`
(a per-match historical snapshot of that side's roster at match time, parsed
into `MatchParserService`'s `homeRosterPlayers`/`awayRosterPlayers`). This is
because a player who has since left/been replaced on a roster is silently
absent from the standalone roster file, even though historical
`matchEvents[]` (in this or another match) can still reference them by
`lineUpId` — without the match-embedded snapshot, that player's identity
(and thus the event's player attribution) is lost. `main.ts` pre-scans every
match's `homeRosterPlayers`/`awayRosterPlayers`, grouping them by roster id
into `matchEmbeddedPlayersByRosterId`, and `TpPlayersImportService` merges
each roster's match-embedded players with `roster.players`, keyed by player
id — the standalone file's data wins on conflict for a given id (presumed
freshest), so the match-embedded snapshot only fills in ids the standalone
file doesn't list. The service also imports **hired star players** — named via an `inducements_roll`
match event's `extraData.starPlayers[]` (see the `match_<id>.json` section
below), not via any field on the roster file itself. Each hired star player
gets one reused `isStarPlayer: true` Position (a bare-name TP external id)
and a Player scoped to the hiring roster's team-era for the era the hiring
match's competition belongs to. Returns `starPlayerIdsByRosterAndMaster`
(keyed `` `${rosterId}:${lineUpMasterId}` ``); as of this writing no
match-event type references a player by `lineUpMasterId` (touchdown/injury
use `lineUpId`), so this map is currently unconsumed downstream — kept for a
future event type that would need it.

**Embedded roster star players** (permanently on a roster's line-up, as
opposed to the ones hired for a single match via `inducements_roll`): before
`starPlayersMasters` was parsed into `starPositions` (above), a `lineUps[]`
entry whose `lineUpMasterId` pointed into that catalog instead of
`lineUpMasters` failed position resolution and was silently skipped — which
in turn left any of that player's match events (touchdown, injury, etc.)
resolving with a null player, since the player itself was never imported.
Fixed once `positionIdsByTpPositionId` covers both catalogs' ids; no change
was needed to `TpPlayersImportService` or match-event resolution, since both
already resolve generically off that map.

**Mercenary Big Guys** (e.g. "Giant"): a small class of `lineUps[]` entries
whose `lineUpMasterId` isn't present in EITHER `lineUpMasters` or
`starPlayersMasters` for that roster at all — no catalog entry exists,
whether because the player has since left the roster or because mercenaries
use a genuinely different catalog TP doesn't expose per-roster. Unlike a
regular or star position, every `lineUps[]` entry (standalone AND
match-embedded) carries its own position name and Big Guy flag directly
inline (`position: "Giant Mercenary"`, `isBigGuy: true`), regardless of
whether it also resolves via a catalog. `TpRosterPlayer.fallbackPositionName`
carries this inline name; `TpPlayersImportService` uses it (gated on
`isBigGuy`, so a genuine regular-position catalog gap is never masked) as
described above.

**Still not handled** (future work): the other top-level fields on a roster
(`imageFile`, `assistantCoaches`, `cheerLeaders`,
`fanFactor`, `ruleSet`, `necromancer`, `reRolls`, `shortTeamName`, `sponsors`,
`teamColor`, `treasury`, `extraGoldQuantity`, `teamSpecialRules`, `league`,
`hasMatchesInProgress`, `hasMatchesPlayed`, and -- newly observed 2026-07 with
Major Season 30, purely additive with nothing removed or reshaped -- `state`,
`freeHireAndFireOrder`, `apothecary`; the parser reads only the fields it
needs, so these required no code change). Note that the same roster shape
reappears nested as `roster` inside `match` and `inscriptions` bodies — not a
coincidence, but the full shape hasn't been reconciled across all three
contexts. Those nested copies lack `rosterMaster` and are not a source for this
import.

## `inscriptions_<slug>_inscriptions.json` (coaches parsed)

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

The rest of each entry is unhandled — `state`, `inscriptionDate`, `categoryId`,
the other `player` fields (`nafUser`, `nafVerified`, `country`, `language`),
`coachRank { ... }`, `roster { ... }` (see roster shape above), and
`hasMatches`. `roster` here is a nested copy that lacks `rosterMaster` and,
per the rosters section above, is not a source for team import.

## `awards_<slug>_awards.json` (not yet parsed)

Not yet handled. An object keyed by category id (a string, e.g. `"22494"`),
each value an array — one entry per award given: `id`, `awardType` (numeric,
meaning unknown), `inscription.roster { ... }` (see roster shape above),
`inscription.player.applicationUser { applicationUserId, userNameToShow,
pictureFileName, country, goldStarAwards }`, `inscription.players[]` (empty in
samples seen so far), `inscription.coachRank.score`. This is a redundant, less
complete view of the coaches already imported from inscriptions (no NAF
fields) — a candidate for an awards sub-issue once that scope is reached.
