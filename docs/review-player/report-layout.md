# review-player report layout

Each sampled player gets one section in the report: a heading naming the
source, the source's own id, the player, team, position, era and database id,
then the strata that selected them. Under it come two panel pairs, each with
the source's own raw view on the left and what the importers stored on the
right:

1. **overview** — who the player is: identity, status and keywords.
2. **career-history** — how the player got where they are: SPP total,
   starting skills and advancements, characteristics against the position
   baseline, lasting injuries and unspent SPP. These sit together because
   advancements, injuries and SPP spend all feed the current characteristics.

Each panel stacks its parts under small subheadings.

## How the panels explain themselves

Headings, row labels and cell text carry the explanation, so the report does
not repeat the same paragraph for every player. The red italic note style is
used only for "no data found" messages (no page in the mirror, no roster
entry, no database row). The few explanations that remain are plain text and
appear only for a player they apply to:

- why no spend range could be modelled for this player;
- that a gap in the recorded advancement history can explain a reported spend
  above the modelled range, on a spend row that actually is above it;
- why a stored unspent SPP outside the modelled range is only a possible gap;
- for a TP player with an extra skill or a gained Loner, how those are priced.

## Rules-set resolution

Several imported sections need a rules set and resolve it from the database
alone: the last rules set listed for the player's era (`era_rules_sets`,
highest id first), because this tool must not read the importers' configs.
That is an insertion-order heuristic matching what the importers themselves
mean by "last-listed", accepted to keep the single-player comparison simple.

## overview

### Left: the source's own record

From whichever source the player was sampled through:

- **Identity** — BBL's own player page (`default.asp?p=pl&pid=<id>`) parsed
  for name, position, team and its career achievement counters, including the
  career SPP figure BBL publishes in the "Unspent SPP" row; or, for TP (which
  has no per-player page), the player's line-up entry from the most recent
  match file they appear in, next to totals aggregated independently across
  every match file — TP's reported `totalStarPlayerPoints`, the sum of
  `starPoints` on their attributed events, and a per-event-code breakdown.
- **Status** — for BBL, every icon in the player page's header block (the
  name under the portrait), as its `alt` text and image file name, in page
  order with no precedence applied; icons on links to other players and the
  bounty icon are not listed, and a header with no icon says so rather than
  calling the player active. For TP, the raw `state` bitmask and `isActive`
  flag of the player's `lineUps[]` entry, verbatim with no bit decoded, from
  the roster file and from the latest match snapshot carrying them, each with
  the file it came from.
- **Keywords (TP template codes and manual curation)** — a player carries no
  keywords of their own; they come from the position. Only TP publishes
  keyword codes, so this part reads TP for every player, BBL-sampled ones
  included: the BB2025 codes on the position template the player was
  recruited from (merged from `lineUps[].lineUpMaster.race`, `positionTypes`
  and `isBigGuy`), the raw `positionTypes` and `isBigGuy` values, and the
  curated catalogue that names the codes (pooled from every curated batch, a
  later batch's restatement replacing the earlier entry). A code no curated
  keyword carries is highlighted.

### Right: what was stored

From the database:

- **Identity** — the stored identity, team, position, era, every external id
  and, for a star player, every other team era that hired the same star.
- **Status** — the stored `players.status`, with NULL shown as
  "unknown (no source reported a status)", never as active. An active player
  whose era has ended gets a line naming the era and its end date.
- **Position keywords** — what `position_rules_set_keywords` recorded for the
  player's position, one row per rules set that position has a
  characteristics row under. It is deliberately not diffed against the raw
  side: that would mean re-running the importer's code resolution, the thing
  under review.

## career-history

### Left: the source's own record

- **SPP figures** — for BBL, both figures of the page's "Unspent SPP" row:
  the career total in brackets and the reported unspent figure, which can be
  negative. For TP, the roster entry's `totalStarPlayerPoints`,
  `starPlayerPoints (unspent)` (see
  [the roster file format](../import-tp/file-format-rosters.md)) and
  `pendingImprovements`.
- **Skills and advancements** — one list per source.
  - BBL: starting skills, then gained skills and the
    `+MA`/`+ST`/`+AG`/`+PA`/`+AV` increase markers in the page's own
    advancement numbering (skills and increases share one numbering). BBL
    records only plain text (starting) versus a coloured span (gained), so no
    skill here carries a random or elite marker, and the imported side's
    markers for a BBL player are not a disagreement with this list.
  - TP: the position template's skills as starting and the line-up entry's
    own skills as gained, each gained skill with TP's `isRandom` (shown as
    "not recorded" when TP has no flag, which is not the same as chosen),
    `isElite` and `isExtra`. When TP published no position template, a note
    says starting skills are unavailable. TP publishes no advancement counter,
    so a **Characteristic improvements (derived from position template)**
    table follows: current stat line against the template, Agility and
    Passing counted downwards because a lower roll target is an improvement.
    It is shown for orientation only and never compared, since an injury and
    an advancement on the same characteristic cancel out in it.
- **Characteristics** — the player's MA/ST/AG/PA/AV as the source publishes
  them: BBL's stat row, verbatim; or, for TP, the position template row and
  the player's current row from the roster file (TP publishes
  characteristics only in `rosters_<id>.json`). TP reports nothing about a
  reduced characteristic, so the gap between the two rows is left for the
  reviewer to read. Only a missing value renders as a dash; a zero prints.
- **Lasting injuries** — BBL's "Sustained Injuries" free text, verbatim; TP's
  `nigglingInjuries` and `canPlayNextGame`, verbatim. Neither is
  interpreted: deciding what the text or the stat gap means is exactly the
  judgement the importer makes.

### Right: what was stored

- **SPP total** — stored `spp_total` and `spp_adjustment`, the SPP this tool
  computes by summing the per-event values over the events where the player
  is the acting participant, how many events contributed, and a verdict. A
  `MISMATCH` (highlighted, labelled) is shown when the stored total disagrees
  with the computed sum _plus_ the stored adjustment, or nothing is stored.
  Events whose recorded SPP differs from the award table follow in their own
  highlighted table.
- **Advancements (rules set, pricing)** — when the era maps to no rules set
  the panel says so instead of showing a table. Otherwise one table of every stored
  `player_advancements` row: starting skills, gained skills and live
  characteristic increases, in the order the cost model numbers them. Columns:
  - **Order** — `free` for a starting skill or free extra; otherwise the
    advancement number the row is priced at. A confirmed entry sits at its
    confirmed number (`(confirmed)`), a skill a league house rule grants
    shows that rule's number, an increase with no stored order says
    `(order unknown)` and is numbered last, and every other entry takes the
    next free number in stored order. Where the stored
    `advancement_order` differs from the number the row is priced at, the cell
    adds it (`#3 (stored #4)`), and a skill stored without an order says
    `#3 (stored order unknown)`, so a gap or duplicate in the stored orders is
    not hidden by the renumbering. Confirmed numbers that cannot all hold
    (two at one number, one past the paid advancements, or one contradicting a
    house rule) are highlighted and say `clashes`, and no range is modelled.
  - **Advancement** — the skill with the dice marker when its stored source
    is `random` and the diamond when it is elite under the rules set (gained
    skills only), or `+MA`/`+ST`/`+AG`/`+PA`/`+AV`.
  - **Source** — the stored `player_advancements.source`, or
    `characteristic increase`.
  - **Modelled cost** — the cost `advancement_costs` gives the row at its
    number: a single number under fixed thresholds; under a rules set that
    prices by kind, the candidate cost of each kind the stored source allows
    (random, chosen or either), narrowed by whether the position has the
    skill's category (`skill_rules_sets`) as primary or as secondary
    (`position_rules_set_skill_categories`): only primary kinds for a primary
    category (also when recorded both ways), only secondary kinds for a
    secondary one, both when neither or nothing is recorded. A skill is never
    priced as `random_characteristic`. Starting skills and free extras
    (`player_advancements.is_free_extra`: a gained Hatred, a skill TP flags
    `isExtra`, Gudarnas Förkämpe's mutation) cost 0; a house-rule skill
    (tLoEG's Fan Favourite) shows the rule's cost.
  - **Raw source** — whether the source the player was sampled through has
    the row. A skill matches a raw skill of the same starting-or-gained
    category whose name is the same or curates onto the same skill through
    `skills_external_ids` (`Name` system). For a BBL player, an increase
    matches a marker of the same characteristic at the same place among the
    advancements; one stored without an order matches a leftover marker of
    the same characteristic and reads `yes, order unknown`. TP publishes no
    increase markers, so a TP player's increases read `not compared`. A stored
    row the raw source lacks is highlighted (`not in the raw source`), and a
    raw skill or marker nothing stored accounts for is appended as its own
    highlighted row (`in the raw source only`). `not read` means the raw
    source could not be read for this player.
- **Characteristics (against position baseline)** — the baseline row for
  the player's position under the resolved rules set, then the stored
  `players` row, each cell formatted the way that rules set displays it and
  marked with an increase or decrease arrow where it differs numerically from
  the baseline. A position with no baseline row gets a highlighted `missing`
  row and no comparison.
- **Lasting injuries** — the seven stored columns, labelled
  `Stored (injured)` or `Stored (no lasting injury)` but never highlighted:
  the highlight means "disagrees" everywhere else in the report.
- **Unspent SPP** — the modelled spend and unspent ranges, the source's
  reported total, its unspent figure and the spend derived from the two, and
  the stored unspent SPP. The range takes, per advancement number, the
  cheapest and dearest cost of any kind the player's advancements could be,
  so it holds for every order and kind assignment. The source's spend outside
  the modelled spend range is the only source figure highlighted, labelled in
  words, and one above it also says that a gap in the recorded history can
  explain it; a spend inside proves nothing, and the source's own unspent
  figure is never highlighted. BBL prices every player's spend at BB2020
  costs, so under a fixed-threshold rules set its spend reads
  `not compared under this rules set`. The stored unspent SPP is placed
  against the modelled unspent range and compared with the source's own
  figure, highlighted when it lies outside or differs, and a dash when
  nothing is stored; outside the range it is annotated as a possible gap only.
  When no range can be modelled, a line says why.

The cost check reads `advancement_costs`, `players`, `player_advancements`,
the era, rules set and league chain (`team_eras`, `eras`, `era_rules_sets`,
`rules_sets`), `positions`, `skills`, `skill_rules_sets`,
`position_rules_sets` and `position_rules_set_skill_categories`, all through
`packages/db`.
