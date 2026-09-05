# review-player

`tools/review-player` renders a side-by-side HTML report of everything known about a
sampled set of players: each import source's **raw** view of the player next to what the
importers actually stored in `game_data`. Like `tools/review-match` it is a review aid for
a human — it cannot decide what is "correct" on its own, because the interpretation logic
it deliberately does not run is the thing being reviewed.

**Architectural boundary:** the raw-source panels never depend on `packages/game-data`,
`packages/parse-tp`, `tools/import-tp` or `tools/import-bbl` — not for parsing, not for
lookups, and not for "safe" shared domain knowledge such as event-code tables. Code that
looks duplicated from `tools/review-match` — the SPP comparison and the TP event-label
table — is duplicated on purpose: sharing it would let a bug agree with itself instead
of showing up as a difference. That rule covers the **domain-specific** half only. The
domain-agnostic scaffolding (HTML fragment assembly, timestamped report writing, JSON5
config loading, the `DataTypeReviewer`/`Stratifier` plug-in contracts and the app-module
wiring) is shared with `tools/review-match` through `packages/review-harness` — it never
touches a raw source's meaning, so it cannot agree with itself about one.
The report document is shared the same way: `report-builder.service.ts` and
`review.service.ts` are thin subclasses of the harness's
`ReportBuilderBase`/`ReviewServiceBase`, adding only the per-player section — the
per-entity preparation hook is a pass-through here. `harness.module.ts` stays local
because it _is_ this tool's own composition.

Scope today is player info, [Star Player Points](../glossary.md#star-player-points-spp)
totals and characteristics. Skills and injuries are deliberately deferred — each will
plug in as another data-type module without touching the harness services.

## What it does

1. Samples players per source (BBL and TP) across nine strata:
   1. **SPP totals disagree** — every player, star or not, whose SPP computed from
      the events where they are the acting participant, plus any stored adjustment,
      differs from their stored total (a nonzero adjustment on its own is not a
      disagreement — it is the normal case for an experienced player) — except a
      star player with no stored total at all. This stratum ignores
      `playersPerStratum` on purpose: a real discrepancy must never be sampled
      away, so a badly-imported database produces a long report rather than a
      reassuring one.
   2. **Non-standard SPP per event** (TP only) — `playersPerStratum` players who have
      at least one match event whose recorded per-event SPP disagrees with the
      standardised award table for their rules set and race. TP reports its own
      per-event figure verbatim, and it can legitimately differ (race-specific
      modifiers, random events, special league rules); a BBL event's figure is
      computed from that table and so can never differ from it, which is why this
      stratum is TP-only. An action type with no row in the award table at all (a
      `foul`, for instance) counts as an expected award of zero. The stratum does
      not decide whether a difference is a bug — that is the reviewer's call from
      the rendered comparison — and it is bounded, because the match is broad
      enough that an uncapped version could flood the report. Unlike the other
      strata, this one carries no star-player or stored-total exclusion: a
      star player with no stored total can still appear here if one of their
      events disagrees with the award table.
   3. **Zero SPP total** — `playersPerStratum` players whose stored total is exactly 0.
   4. **Small SPP total (1-20)** — `playersPerStratum` players whose stored total is
      in that range.
   5. **Large SPP total (100+)** — `playersPerStratum` players whose stored total is
      at least 100.
   6. **Random sample** — `playersPerStratum` (default 3) non-star players per source.
   7. **Star players** — `playersPerStratum` star players per source, sampled
      randomly like the regular stratum but kept separate and bounded by the same
      limit.
   8. **Characteristic increased** — `playersPerStratum` players with at least one
      of MA/ST/AG/PA/AV numerically higher on their stored `players` row than on the
      baseline their position carries under their era's rules set. Both this stratum
      and the next exclude a player whose era maps to no rules set, or whose position
      has no baseline row for it: there is nothing to compare against.
   9. **Characteristic decreased** — the mirror image: at least one characteristic
      numerically lower than that baseline. An advancement raises a characteristic and
      an injury lowers one, so neither stratum is a finding on its own; they exist so a
      run always contains players whose values are not simply their position's, which is
      where a mis-parsed stat line shows up. The comparison is numeric, not
      "better/worse" — under BB2020 a lower Agility is a better Agility, and which is
      which is the reviewer's call. A player whose characteristics were never imported
      still carries the column defaults of 0 and so appears as decreased, which is
      itself worth seeing. The imported-panel view marks a Passing change whenever
      either side has a value and the other doesn't, so a Passing-only change can show
      a marker there without selecting the player into either stratum here, since both
      strata require Passing present on both sides to compare it at all.

   The random-sample stratum excludes star players outright: today's data model
   gives a popular star their own `players` row per team that induces them, so
   an unbounded stratum would be dominated by the same few stars appearing many
   times over. The discrepancy stratum excludes only the narrower case of a
   star player with no stored total at all — an induced star player often has
   none, which would always be a "disagreement" by definition, not a real one
   worth flagging — but still includes a star player who does carry a real
   stored total, since excluding every star player outright would hide a
   genuine, fixable mismatch behind whatever the bounded star-players stratum
   happens to sample. Of the automatic
   strata, only the star-players stratum and the non-standard-per-event stratum
   can select a star player with no stored total at all; `overrides` (below) can
   still name one explicitly regardless of stratum.

   The three magnitude strata (zero/small/large) exist because a player's total can
   range from nothing to several hundred and different magnitudes stress different
   parts of the SPP pipeline; a single undifferentiated random sample under-covers
   the extremes. A player with no stored total at all — commonly an induced star
   player — is excluded from all three, needing no exclusion of its own to arrange.
2. Adds every player id listed in `overrides`, whatever the strata picked.
3. For each sampled player, renders two panel pairs:
   - **player-info** — left: BBL's own player page (`default.asp?p=pl&pid=<id>`) parsed
     for name, position, team and its career achievement counters, including the career
     SPP figure BBL publishes in the "Unspent SPP" row; or, for TP (which has no
     per-player page), the player's line-up entry from the most recent match file they
     appear in, next to totals aggregated independently across every match file — TP's
     reported `totalStarPlayerPoints`, the sum of `starPoints` on their attributed
     events, and a per-event-code breakdown. Right: the stored identity, team, position,
     era and every external id.
   - **spp-totals** — left: the SPP this tool computes by summing the per-event values
     over the events where the player is the _acting_ participant. Right: the stored
     total and the stored adjustment. Both panels are database-derived, so they carry
     their own headings rather than the harness's raw/imported wording, and a
     `MISMATCH` — highlighted row, explicit label in both panels — is shown when the
     stored total disagrees with the computed sum _plus_ the stored adjustment (not
     the raw computed sum), or has no stored total at all.
   - **player-characteristics** — left: the player's own MA/ST/AG/PA/AV as their
     source publishes them — BBL's player page stat row, or the TP roster file
     entry for their line-up id (TP publishes a player's characteristics only in
     `rosters_<id>.json`; the line-up snapshots inside a match file carry none, so a
     player TP has no roster file for shows an explicit note). Right: the baseline
     row for the player's position under their era's rules set, then the stored
     `players` row, each cell formatted the way that rules set displays it and
     marked with an increase or decrease arrow where it differs numerically from the
     baseline directly above. Only a `null` characteristic renders as a dash, in both
     panels; a stored zero prints as-is, matching the convention `tools/review-race`
     already used — it may be the not-yet-curated placeholder still sitting in
     Move/Strength/Agility/Armour, or a real "structurally cannot pass" value for a
     `plus_zero_legal` Passing characteristic. A position with no baseline row for the
     resolved rules set gets a highlighted `missing` row and no comparison.

     The rules set is resolved from the database alone — the last rules set listed
     for the player's era (`era_rules_sets`, highest id first) — because this tool
     must not read the importers' configs. That is an insertion-order heuristic
     matching what the importers themselves mean by "last-listed", accepted here
     to keep the single-player comparison simple.
4. Writes the report under `tools/review-player/output/` (gitignored) with a timestamp in
   the filename, and prints where it landed.

Strata that match nothing, and override ids that are not in the database, are reported as
gaps in the report (and as console warnings) — never as failures.

## Configuration

```bash
cp tools/review-player/review-player-config.example.json5 tools/review-player/review-player-config.json5
```

| Key | Meaning |
| --- | --- |
| `database.url` | Connection string of the database holding the imported data (required) |
| `playersPerStratum` | Players sampled per source for every bounded stratum — random, star-players, non-standard-SPP and the three magnitude strata (default 3); the discrepancy stratum ignores it |
| `bbl.dataDir` / `tp.dataDir` | The same downloaded data directories `tools/import-bbl` / `tools/import-tp` read |
| `bbl.externalSystemName` / `tp.externalSystemName` | External-system names the imports registered records under (default `BBL` / `TP` if unset or empty; this project's own imports register `tloeg.bbleague.se` / `tourplay.net`) |
| `overrides.bbl` / `overrides.tp` | External player ids always included (BBL: `pid`; TP: the line-up `id`) |
| `outputPath` | Base path each report is written next to, timestamped (default `output/report.html`) |

Relative paths resolve against the working directory, which is `tools/review-player/` when
the tool is run as documented below.

## Running it

The stack must be running and already imported into.

```bash
pnpm --filter @blood-bowl-tracker/review-player run build
pnpm --filter @blood-bowl-tracker/review-player run start
```

Exit codes: `0` with `Reviewed <N> player(s); report written to <path>.` on success; `1`
with `Review failed: <error>` when the database is unreachable or the config is unusable.

A TP-sampled player makes the tool scan every downloaded `match_<id>.json` once per
process (TP publishes no per-player file), which is the slowest part of a run by a wide
margin. That cost is the price of not reusing `tools/import-tp`'s reader, which is code
under review.

The tool only reads game data. It does connect through `packages/db`'s `DbModule`, which
applies any pending migrations on connect — against a stack deployed from the same branch
that is a no-op.
