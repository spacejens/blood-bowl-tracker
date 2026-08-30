# `match_<id>.json` (play date and name parsed)

See [file-format.md](./file-format.md) for the other pages.

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

## Match category classification (`phaseType`/`phaseOrder`/`round`/`winner`)

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
structural row, not a modeled roll). A `None` `injuryType` is a real,
imported event (a genuine "Badly Hurt" result — see below).

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

`None` is a genuine Badly Hurt result, not "no injury happened", so it is
always imported like any other injury type.

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
The one exception is `sent_off`: although TP can carry a `starPoints` value
on it, a sent-off event has no acting player (only a consequence player), so
it structurally cannot own an SPP award and the importer never writes
`spp_value` for it.

## Casualty/injury correlation (code 6 ↔ code 8)

A code-6 `casualty_caused` event is the ACTION of a specific player breaking
armor; a code-8 `injury` event is the roll reporting the VICTIM and severity.
They are TP's one exception to "no correlation needed": the specific
attacker can only be recovered by pairing the two events after the fact,
implemented in `tools/import-tp/src/match-events/tp-match-events-correlation.service.ts`
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
`homeRosterPlayers`/`awayRosterPlayers`, see [`rosters_<id>.json`](./file-format-rosters.md); the
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
