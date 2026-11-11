# review-player

`tools/review-player` renders a side-by-side HTML report of everything known about a
sampled set of players: each import source's **raw** view of the player next to what the
importers actually stored in `game_data`. Like `tools/review-match` it is a review aid for
a human — it cannot decide what is "correct" on its own, because the interpretation logic
it deliberately does not run is the thing being reviewed. A change to what either
importer stores for players usually needs a matching renderer change here.

**Architectural boundary:** the raw-source panels never depend on `packages/game-data`,
`packages/parse-tp`, `packages/import`, `tools/import-tp` or `tools/import-bbl` — not for parsing, not for
lookups, and not for "safe" shared domain knowledge such as event-code tables. Code that
looks duplicated from `tools/review-match` — the SPP comparison and the TP event-label
table — is duplicated on purpose: sharing it would let a bug agree with itself instead
of showing up as a difference. That rule covers the **domain-specific** half only. The
domain-agnostic scaffolding (HTML fragment assembly, timestamped report writing, JSON5
config loading, the `DataTypeReviewer`/`Stratifier` plug-in contracts and the app-module
wiring) is shared with the other review tools through
[`packages/review-harness`](../review-harness/index.md) — it never touches a raw source's meaning, so it
cannot agree with itself about one.
The advancement-cost check follows the same rule: it re-prices a player's
stored advancements against `advancement_costs` itself rather than using
`packages/game-data`'s `UnspentSppService`, and does so more coarsely on
purpose, so a wrong curated cost or a wrong derivation shows up as a
difference instead of agreeing with itself.
Locating and byte-decoding a BBL mirror file is shared on a similar basis, via
[`packages/read-bbl-mirror`](../read-bbl-mirror/index.md): it carries no BBL-page-type awareness or HTML
parsing, so depending on it does not weaken the boundary above.
Walking the curated keyword batches is shared via
`packages/review-harness`'s `ManualBatchReaderService`. It shapes no entry, so
every reading of what a curated keyword means still happens in this tool; it only
lists the batches and their files in order, parses them (JSON5) and pools each
top-level array.
The report document is shared the same way: `report-builder.service.ts` and
`review.service.ts` are thin subclasses of the harness's
`ReportBuilderBase`/`ReviewServiceBase`, adding only the per-player section — the
per-entity preparation hook is a pass-through here. `harness.module.ts` stays local
because it _is_ this tool's own composition.

Scope today is player info, [Star Player Points](../glossary.md#star-player-points-spp)
totals, characteristics, current lasting injuries, skill advancements, BB2025
keywords, player status, and advancement costs with unspent SPP, shown per player
in two panel pairs (an overview and a career history).

## What it does

1. Samples players per source (BBL and TP) across twenty-three strata:
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
   10. **Currently injured** — `playersPerStratum` players carrying any active
       lasting injury: a miss-next-game, a niggling injury, or any
       characteristic reduction. Bounded like the other sampling strata,
       because an injured player is not a finding on its own — the stratum
       exists so a run always contains players whose lasting-injury columns
       are non-default, which is where a mis-read source would show up. A run
       over a healthy league would otherwise show nothing but zeroes.
   11. **Healed** — `playersPerStratum` players whose current row carries no
       lasting injury but some earlier version of it did. This is the only
       stratum that reads a history table: `players` is history-tracked, and a
       healed injury survives nowhere else. Both importers manufacture the two
       history versions a freshly-imported player needs when their injury
       predates the import, so this stratum is what makes that step
       observable.
   12. **Starting skills differ from position** — a player whose stored
       `player_advancements` rows tagged `starting` do not match, as a skill-id set,
       the skills their position carries under the era's last-listed rules
       set. A starting skill set is copied from the position, so a difference
       is either a mis-parsed player page or a position whose own skills are
       wrong — either is worth a human's eyes. This stratum reads only the
       database, so it cannot itself be "differs from the raw source"; it is
       the closest DB-expressible signal.
   13. **Gained an elite skill** — a player with at least one gained
       (non-`starting`) skill flagged elite under the era's last-listed rules
       set. BB2025's elite distinction is rare, so this guarantees a run
       exercises it at all rather than only turning up by chance.
   14. **Gained a randomly rolled skill** — a player with at least one gained
       skill whose stored source is `random`.
   15. **Gained a freely chosen skill** — a player with at least one gained
       skill whose stored source is `chosen`.

       None of the last three strata is a finding on its own: a run simply
       always contains an elite, a randomly rolled and a freely chosen gained
       skill, each of which exercises a different importer path.

   16. **BB2025 position without keywords** — a player whose position has a
       BB2025 `position_rules_sets` row with no matching
       `position_rules_set_keywords` row. This stratum reads only the
       database, so "differs from TP" cannot itself be a stratum here; this
       is the closest DB-visible signal that a keyword was dropped.
       "BB2025" is resolved by the rules set's own name, never a hard-coded
       id.
   17. **Active, running era** — `playersPerStratum` players whose stored
       status is `active` and whose era has no end date or one not yet
       passed.
   18. **Dead** — `playersPerStratum` players whose stored status is `dead`.
   19. **Retired** — `playersPerStratum` players whose stored status is
       `retired`.
   20. **Temporarily retired** — `playersPerStratum` players whose stored
       status is `temporarily_retired`.
   21. **Unknown status** — `playersPerStratum` players with no stored status
       (NULL: no source reported one).
   22. **Active, ended era** — `playersPerStratum` players whose stored status
       is `active` and whose era's end date is set and earlier than today's
       date in UTC, matching the bot's player status line.

       None of these six is a finding on its own: they exist so a run always
       shows each status, including the rare ones (TP and especially BBL have
       few temporarily retired players, so that stratum is often a gap). The
       two active strata do not overlap; an era has ended when
       `eras.end_date` is set and before today's date in UTC. All six
       exclude star players, like the random-sample stratum: a star hired
       through an `inducements_roll` event has no TP status, so they would
       crowd the unknown sample, and the star player review covers them
       separately.

   23. **Unspent SPP disagreeing with the modelled range or the source** —
       every player whose spend as the source reports it lies outside the
       spend range modelled from their stored advancements and
       `advancement_costs`. The source's spend is its own total minus its own
       unspent figure, both from the same page or snapshot: for BBL the
       bracketed career total minus the "Unspent SPP" figure, for TP
       `totalStarPlayerPoints` minus `starPlayerPoints`. It also lists every
       player whose stored unspent SPP lies outside the modelled unspent range
       or differs from the source's own unspent figure; a player with no
       source figure is listed on the stored figure's range placement alone.
       The outside-range verdict only points to a possible gap: a gap in the
       recorded history, free skills, an unrecorded order of advancements and
       chosen-or-random uncertainty may all cause it. A BBL figure on a
       kind-priced rules set (BB2020, DB2021, BB2025) can still be too low
       when BBL priced a rolled skill as a chosen advancement. Spend
       is compared rather than unspent SPP because the stored total need not
       be the total the source's unspent figure was taken from: the stored TP
       total is the highest over the roster file and every match snapshot,
       while both TP figures come from one roster snapshot. Like the
       discrepancy stratum it ignores `playersPerStratum`, so a real
       disagreement is never sampled away. The amount of unspent SPP held,
       on its own, never selects anyone. Star players (they never advance), players with
       no stored total and players whose rules set has no costs, or has none
       for one of their advancement numbers, are never listed. BBL
       recalculates older totals at BB2020 rates and prices every player's
       spend at BB2020 costs, so under fixed thresholds (CRP, CRP+, BB2016)
       its figures are never compared and the importer ignores them as well.
       Such a player is listed only when the stored unspent SPP, worked out
       from the history, lies outside the modelled range; TP players are
       compared under every rules set. The skip is permanent, because BBL's
       figure is BB2020-priced there. It is the one stratum that reads the raw
       sources rather than only the database, through the same readers the
       panels use; only the BBL unspent-SPP reader caches each page it reads,
       so the panels of a listed BBL player do not read that page again.

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
3. For each sampled player, renders two panel pairs, each with the source's
   own raw view on the left and what was stored on the right:
   - **overview** — identity, status and keywords;
   - **career-history** — SPP total, starting skills and advancements (one
     table on the imported side, with each advancement's modelled cost and
     whether the raw source has it), characteristics against the position
     baseline, lasting injuries and unspent SPP.

   [Report layout](report-layout.md) describes every part of both panels.

4. Writes the report under `tools/review-player/output/` (gitignored) with a timestamp in
   the filename, and prints where it landed.

Strata that match nothing, and override ids that are not in the database, are reported as
gaps in the report (and as console warnings) — never as failures.

## Configuration

```bash
cp tools/review-player/review-player-config.example.json5 tools/review-player/review-player-config.json5
```

| Key                              | Meaning                                                                                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database.url`                   | Connection string of the database holding the imported data (required)                                                                                                                                                                                                       |
| `playersPerStratum`              | Players sampled per source for every bounded stratum — random, star-players, non-standard-SPP, the three magnitude strata, the currently-injured and healed-injury strata, and the six player-status strata (default 3); the discrepancy and reported-spend strata ignore it |
| `bbl.dataDir` / `tp.dataDir`     | The same downloaded data directories `tools/import-bbl` / `tools/import-tp` read                                                                                                                                                                                             |
| `overrides.bbl` / `overrides.tp` | External player ids always included (BBL: `pid`; TP: the line-up `id`)                                                                                                                                                                                                       |
| `outputPath`                     | Base path each report is written next to, timestamped (default `output/report.html`)                                                                                                                                                                                         |

The tool finds BBL and TP records by their shared external-system names
(`tloeg.bbleague.se` and `tourplay.net`), so they are not configured.

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

The reported-spend stratum reads every mirrored BBL player page and the TP roster files once per run, so a run takes longer than the number of sampled players suggests.

The tool only reads game data. It does connect through `packages/db`'s `DbModule`, which
applies any pending migrations on connect — against a stack deployed from the same branch
that is a no-op.
