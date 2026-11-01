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
wiring) is shared with the other review tools through
`packages/review-harness` — it never touches a raw source's meaning, so it
cannot agree with itself about one.
The advancement-cost check follows the same rule: it re-prices a player's
stored advancements against `advancement_costs` itself rather than using
`packages/game-data`'s `UnspentSppService`, and does so more coarsely on
purpose, so a wrong curated cost or a wrong derivation shows up as a
difference instead of agreeing with itself.
Locating and byte-decoding a BBL mirror file is shared on a similar basis, via
`packages/read-bbl-mirror`: it carries no BBL-page-type awareness or HTML
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
keywords, player status, and advancement costs with unspent SPP.

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
       `player_skills` rows tagged `starting` do not match, as a skill-id set,
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
       is `active` and whose era's end date is set and earlier than today.

       None of these six is a finding on its own: they exist so a run always
       shows each status, including the rare ones (TP and especially BBL have
       few temporarily retired players, so that stratum is often a gap). The
       two active strata do not overlap; an era has ended when
       `eras.end_date` is set and before today. All six exclude star players,
       like the random-sample stratum: a star hired through an
       `inducements_roll` event has no TP status, so they would crowd the
       unknown sample, and the star player review covers them separately.

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
3. For each sampled player, renders eight panel pairs:
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

   - **lasting-injuries** — left: what the source itself says is outstanding.
     BBL's player page states it as free text ("Sustained Injuries"), rendered
     verbatim; TP states `nigglingInjuries` and `canPlayNextGame` directly and
     says nothing at all about a reduced characteristic, so its panel shows
     the player's current stat line beside their position template and leaves
     the gap for the reviewer to read. Right: the seven stored columns, with the
     row highlighted when any of them is non-default. Every panel is
     deliberately uninterpreted — deciding what the text or the gap means is
     exactly the judgement the importer makes, and a panel that made the same
     judgement could only ever agree with it.
   - **player-advancements** — left: whichever source the player was sampled
     through, showing starting skills alongside gained ones because a gained
     skill only makes sense against the set the player started with.
     - BBL's player page records only plain text (a starting skill) versus a
       coloured span (a gained one); it cannot say whether a gained skill was
       randomly rolled or freely chosen, and it has no elite concept at all,
       so no skill in this panel ever carries the dice or diamond marker — the
       panel says so in words rather than showing an "unverifiable" mark per
       row. The import infers random or chosen from the SPP the page reports
       as spent where only one answer fits, so the imported panel can show the
       dice marker for a BBL player; this raw panel cannot. It also shows
       BBL's own `+MA`/`+ST`/`+AG`/`+PA`/`+AV` characteristic increase
       markers, each with its place among the player's advancements (gained
       skills and increases share one numbering).
     - TP's roster file gives the position template's skills as starting and
       the line-up entry's own skills as gained, each gained skill carrying
       `isRandom` and `isElite` where TP recorded them (a skill with no
       `isRandom` flag at all shows no dice marker and is called out in a
       note — absent is not the same as "chosen"). TP publishes no
       advancement counter, so this panel also shows characteristic
       improvements derived from the current stat line against the position
       template, with Agility and Passing counted downwards because a lower
       roll target is an improvement there; they are shown for orientation
       only and never compared against anything, since an injury and an
       advancement on the same characteristic cancel out in the same diff.

     Right: every stored `player_skills` row for the player, resolved against
     the era's last-listed rules set the same way the stratification service
     does. A starting row is always plain; a gained row takes the dice marker
     when its stored source is `random` and the diamond when the skill is
     elite under that rules set, either or both at once. Each stored row is
     also checked by name against the source the player was sampled through —
     read through the same services the raw panel above uses — and a stored
     skill missing from the raw source, or a raw skill nothing was stored for,
     is highlighted and says so in words. This comparison is presence-only: it
     does not check that a skill's source (starting vs. gained) or its order
     among the source's own list agrees with what was stored. The stored
     characteristic increases (`player_advancements` rows, removed ones left
     out) are listed in stored order with their order and whether it is
     confirmed. For a BBL-sourced player each is checked against the raw
     markers: it must match one of the same characteristic at the same place
     among the advancements, so both the count and the relative order are
     verified; a stored increase with no marker, and a marker with no stored
     increase, are highlighted and say so in words. TP publishes no markers
     (its raw panel already shows a derived template diff instead), so a TP
     player's increases are listed without a comparison.

   - **player-keywords** — a player carries no keywords of their own; they
     come from the player's _position_, so this panel pair differs in shape
     from the others. Left: the BB2025 keyword codes TP publishes on the
     position template this player was recruited from, merged from
     `lineUps[].lineUpMaster.race`, `positionTypes` and `isBigGuy` (in the
     same downloaded roster file the characteristics panel already reads),
     alongside the raw `positionTypes` and `isBigGuy` values so a reviewer can
     check the decode without reading the JSON by hand, next to the curated
     catalogue that names them (pooled from every curated batch, a later
     batch's restatement of a keyword replacing the earlier entry) — a code no
     curated keyword carries is highlighted, and
     a player no downloaded TP roster file carries gets a note instead of a
     table. Only TP publishes keyword codes at all — BBL has no such concept
     — so there is no BBL sub-section here. Right: what
     `position_rules_set_keywords` recorded for the player's _position_, one
     row per rules set that position has a characteristics row under, so a
     reviewer can see the era's rules set alongside the others rather than
     this panel deciding which one applies. This panel deliberately does not
     diff itself against the raw panel — that would mean re-running the
     importer's own code resolution, the thing under review.
   - **player-status** — left: what the source itself shows. For BBL, every
     icon in the player page's header block (the name under the portrait),
     as its `alt` text and image file name, in page order with no precedence
     applied; icons on links to other players elsewhere on the page and the
     bounty icon are not listed, and a header with no icon says so rather than
     calling the player active. For TP, the raw `state` bitmask and `isActive`
     flag of the player's `lineUps[]` entry, verbatim with no bit decoded, from
     the roster file and from the latest match snapshot carrying them, each
     with the file it came from. Right: the stored `players.status`, with NULL
     shown as "unknown (no source reported a status)", never as active; an
     active player whose era has ended gets a note naming the era and its end
     date.
   - **advancement-costs** — left: the figures the source itself reports
     about spending SPP. For BBL, both figures of the player page's
     "Unspent SPP" row — the reported unspent figure, which can be
     negative, and the career total in brackets — with the gained skills and the
     `+MA`/`+ST`/`+AG`/`+PA`/`+AV` increases in one page-order list; the panel says
     in words that BBL cannot tell a rolled skill from a chosen one. For TP,
     the roster entry's `totalStarPlayerPoints`, `starPlayerPoints` (the SPP
     TP holds unspent, see
     [the roster file format](../import-tp/file-format-rosters.md)) and
     `pendingImprovements`, with each gained skill's `isRandom`, `isElite`
     and `isExtra`; the panel says that TP's download carries no
     per-advancement cost, that extra skills such as Hatred are imported
     as free extras and priced at 0, and that a Journeyman's Loner is also
     granted without SPP being spent, which the modelled range does not
     recognise, so such a player can legitimately be listed. Right: the
     era's last-listed rules set, then one row per advancement with the cost
     `advancement_costs` gives it at its number — a single number under fixed
     thresholds, the candidate cost of each kind under a rules set that prices by kind, narrowed to random or
     chosen kinds where the stored skill source says which. A gained skill
     is also priced by whether the player's position has the skill's
     category (`skill_rules_sets`, under the same rules set) as primary or
     as secondary (`position_rules_set_skill_categories`): only the primary
     kinds for a primary category (also when the category is recorded both
     ways), only the secondary kinds for a secondary one, and both when the
     position has the category neither way or no categories are recorded.
     A coach who rolls a characteristic result may take a skill instead and
     pay the characteristic price; that is not modelled, so a skill is never
     priced as `random_characteristic`, and a player whose reported spend can
     only be explained that way is listed. Starting skills and a skill
     stored as a free extra (`player_skills.is_free_extra`: a gained Hatred,
     a skill TP flags `isExtra`, or Gudarnas Förkämpe's mutation) cost 0 and
     take no number; a skill a league house rule grants (tLoEG's Fan
     Favourite) shows as that rule's advancement with its cost. Gained skills and
     characteristic increases are listed together in their stored order,
     which is unverified unless marked confirmed, entries without an order
     last. A footer gives the stored total, the
     modelled spend and unspent ranges, and beside them the source's reported
     total, its unspent figure and the spend derived from the two. A last row
     gives the stored unspent SPP, placed against the modelled unspent range
     and compared with the source's own unspent figure, highlighted when it
     lies outside the range or differs, and a dash when nothing is stored. An outside-range
     stored figure is annotated as a possible gap only (a gap in the recorded
     history, a free skill, or an unrecorded order or chosen-or-random choice
     may cause it). The range takes, per advancement number, the cheapest and
     dearest cost of any kind the player's advancements could be, so it holds
     for every order and kind assignment. The source's derived spend is placed
     against the modelled spend range, the same comparison the stratum makes:
     a spend outside it is a real disagreement and is the only source figure
     highlighted, labelled in words; a spend inside it proves nothing, and the
     source's own unspent figure is never highlighted. When either source
     figure is missing the spend shows as a dash and nothing is compared. BBL
     prices every player's spend at BB2020 costs, so under a fixed-threshold
     rules set its figures are shown but never compared, with a note saying
     the stored unspent SPP is checked instead. A note says that gaps in the
     recorded advancement history can explain a reported spend above the
     range. The cost check reads `advancement_costs`, `players`,
     `player_skills`, the era, rules set and league chain
     (`team_eras`, `eras`, `era_rules_sets`, `rules_sets`), `positions`,
     `skills`, `skill_rules_sets`, `position_rules_sets` and
     `position_rules_set_skill_categories`, all through `packages/db`.
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
