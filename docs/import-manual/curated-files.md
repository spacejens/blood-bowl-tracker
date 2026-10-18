# Curated data files

`tools/import-manual`'s committed data lives in numbered batch directories, and every
file in them exists for a specific reason — mostly to unify records the BBL and
TP importers would otherwise create as separate, duplicate rows. This page is
the reference for what each file holds. See [import-manual](index.md) for how
the tool is configured and run, and [Data layout](index.md#data-layout) for how
the batches are laid out on disk.

Files below are named by the batch that holds them; batches 001 and 002 are
historical and never edited (see [Batches](batches.md)).

## Known batch 001 dedup files

A few `data/batches/001-before-initial-sources/*.json5` files exist specifically to unify
records the BBL and TP importers would otherwise create as separate,
duplicate rows because the two source systems name or key the same
real-world entity differently:

- `leagues.json5` — the two real leagues, tLoEG and GBBL. This
  file exists ahead of the BBL/TP importers so `competition-groups.json5` (see
  below) has a league to reference. Its external ids deliberately match BBL's
  own `tloeg.bbleague.se` convention exactly, so BBL's later league upsert
  resolves onto these same rows instead of creating duplicates.
- `competition-groups.json5` — the curated catalog of competition groups:
  the recurring tracks (Major Season, Minor Season, Chaos Cup,
  Ogretoberfest, and so on) that `competitions.json5` and `trophies.json5`
  classify instances and trophies into. Not a dedup file in the usual sense —
  like `trophies.json5`, nothing else creates competition groups, so this is
  the sole source of the catalog.
  Every group also carries a required `namePattern` that TP competition
  import uses to classify a brand-new instance automatically.
- `eras.json5` — the 8 eras the BBL and TP configs define, copied verbatim
  from `tools/import-bbl/import-bbl-config.json5` and
  `tools/import-tp/import-tp-config.json5`, which remain authoritative. It
  exists here purely so `competitions.json5` in the same batch has an era to
  reference.
- `competitions.json5` — all 86 known competition instances, each with its
  curated [competition group](index.md#competition-groups) and the real
  data needed to create the row. Classification has to happen
  here, ahead of the BBL and TP importers, because `tools/import-tp`'s awards
  import resolves a trophy by the competition's group name. Renaming stays in
  batch 002.
- `races-and-positions.json5` — BBL/TP race and regular position name
  variants. `positions_race_eras` availability restoration is curated
  separately, in `position-availability.json5` (see below). Source importers
  set a race's or position's name only when they create it, so the names here
  stick.
- `coaches.json5` — BBL's partial name vs. TP's full name for the same coach.
- `teams.json5` — team name variants. Source importers set a team's name only
  when they create the team, so the name here sticks.
- `star-players.json5` — star player `Position` rows. Both BBL and TP
  importers attach a `Name` external id equal to the star's bare name across
  all three star-position code paths (the roster-catalog path, the
  inducement-hire path, and the Big Guy mercenary fallback — see
  [file-format-rosters.md](../import-tp/file-format-rosters.md)).
  Star players whose names match verbatim between the two systems therefore
  dedupe automatically via that shared `Name` external id, so this file is
  needed only for genuine spelling mismatches where BBL and TP disagree —
  smart vs. straight quotes, a leading "The", trailing epithets — which are
  deliberately left unmerged rather than guessed at, for the same reason
  `races-and-positions.json5` leaves ambiguous position renames unpaired: a
  wrong guess would silently conflate two different star players' rows.
- `spp-award-values.json5` — the standardised SPP award table, plus the
  rules-set rows it references. It declares rules sets under
  the `Name` system by their **bare name** (`CRP`, not `name:crp`), so the
  BBL/TP importers' later upserts match the same rows.
- `trophies.json5` — the curated catalog of known trophies,
  split between team and player recipients, from BBL's own `p=tt`/`p=ppr`
  legend pages plus the TP-only Ogretoberfest and the three Dungeon Bowl
  placements. 12 of the player entries are group-scoped duplicates of a BBL
  player-trophy label that BBL awards in more than one competition group,
  keyed by a composite `${label}-${groupName}` external id.
  Not a dedup file in the usual sense — nothing else creates trophies yet, so
  this is the sole source of the catalog.

  Every entry also carries an `awardRuleKind`, saying where the trophy's
  winner comes from. Pick `direct_source` when the source data already records
  the winner and the BBL/TP importers create the award; `manual` when nothing
  determines the winner mechanically (a coaches' vote, a D3 roll) and each
  winner is curated by hand in batch 002's `trophy-awards.json5`
  (see below). Both describe how the league hands the trophy out in their own
  words.

  The other three are computed from imported match events instead, and
  describe themselves: `max_count` for the competition's leader on a count of
  matching events, `max_spp_sum` for its leader on the Star Player Points
  those events awarded, and `career_threshold` for every player who passes a
  lifetime figure, however many that turns out to be.
- `position-characteristics-gap-fill.json5` — gap-fill `position_rules_sets`
  rows: `(position, rules set)` pairs no source importer can ever produce,
  curated early so a source importer can read them back. Also registers the
  positions those rows reference, since nothing else in this batch does.
  Currently one entry, Giant Mercenary under BB2020, which `tools/import-tp`
  reads for its mercenary hires.
- `skills.json5` — the skills that exist only in CRP/CRP+/BB2016, plus the
  category table (`skill_rules_sets`) for **every** skill under **every** rules
  set. A missing row means the rules set does not have that skill, and the BBL
  and TP skill imports read these rows back before recording a starting skill —
  so an uncurated (skill, rules set) pair becomes an import error naming this
  file. `unique` is the only marker a star player's exclusive skill has.

  A `skillRulesSets` entry may also carry `isElite: true`. That is BB2025's
  orthogonal "elite" marker on a handful of skills — Block, Dodge, Guard and
  Mighty Blow — that cost more player value to pick than a non-elite skill,
  not a restriction on which skills can be picked. It is not another
  category, so it is a separate boolean. The field is optional and defaults
  to `false`; only the four BB2025 elite rows spell it out, and no rules set
  older than BB2025 has the concept at all.
- `keywords.json5` — the sole source of every BB2025 keyword's name and
  `kind` (`species`/`positional`/`special`). No downloaded source names a
  keyword at all — `tourplay.net` exposes only the opaque numeric codes it
  assigns each one — so this file's 41 hand-curated rows are the entire
  catalogue, each carrying its `tourplay.net` numeric code as an external id.
  That id is what `tools/import-tp` resolves a `race` array code, or a
  Hatred/Animosity target code, back against.

### Position renamed across rules-set generations

TourPlay assigns a **fresh numeric position id for every rules-set generation**
of a roster — whether or not the position's name changed. Blood Bowl also
renames the occasional roster slot at a rules-set boundary while it stays the
same slot: Lizardmen's "Skink Runner Lineman" became "Skink Lineman" in BB2025,
Dwarf's "Dwarf Blocker Lineman" became "Dwarf Lineman", Norse's "Norse Raider
Lineman" became "Norse Raider", and Underworld Denizens' "Underworld Troll"
became "Troll".

Position matching is strictly by external id, never by name text, so an
unregistered new-generation id creates a brand new, disconnected `positions`
row. The position's characteristics history then splits across two rows, and
[review-race](../review-race/index.md) reports "missing" for every rules set
the other row's era does not cover — even though it is genuinely one position.

The fix, and the convention for any future rename, is to register **every
generation's id on the one existing curated row** in
`races-and-positions.json5` rather than letting a second row appear:

- Add the new id to the existing entry's `externalIds`; never remove the older
  one. Order the array BBL id, newest TP id, older TP id(s), `Name` id.
- Where the name changed, set the entry's `name` to the **current** name.
  Keep the `Name` id it was first curated under, and also list every
  `<race>: <source name>` id the BBL/TP importers derive for the same row
  (after it): those derived ids are what `position-characteristics.json5` and
  `position-availability.json5` reference, and listing them here makes every
  pairing visible to the curated-data tests.
- Every `position-availability.json5` entry sharing a `Name` id with an entry
  here carries the same `name` (a test enforces it). Batch 002
  renames the position, so a different spelling there would flip the
  row's name on every run. Which spelling: the position's current (BB2025)
  name as TP uses it, falling back to the name in the batch 001 file when
  TP has no data for the position.
- `position-characteristics.json5` requires no change: each entry is keyed by
  the position's `Name` external id, not a display name, so the renamed row's
  merged identity (with both old and new ids registered) resolves the reference
  correctly. The same holds for batch 001's `position-characteristics-gap-fill.json5`, except that its own `positions` entries carry a display `name` that must be kept current like any other. batch 002's `position-skills.json5` is keyed the same way, by the
  position's `Name` external id, so it needs the identical no-change treatment.
- Leave a comment on the entry naming each source, its id, and which generation
  that id belongs to, so the next curator can tell a genuine rename from a
  spelling difference between the two sources.

Only merge ids you can positively confirm — same race, same roster slot, same
characteristics — against locally downloaded source data. An ambiguous rename is
deliberately left unpaired rather than guessed at, for the same reason
`star-players.json5` leaves ambiguous star names unmerged: a wrong guess
silently conflates two different positions' histories, which is far harder to
notice and undo than a missing merge.

## Known batch 002 cleanup files

`data/batches/002-after-initial-sources/*.json5` files run once the BBL and TP importers
have created their records, to fix up names or attach external IDs the source
systems could not supply:

- `coaches.json5` — TP usernames replaced with a readable coach name. These
  names are pseudonymized (see [Data layout](index.md#data-layout)), so this is
  where a coach's displayed pseudonym is set. Source importers set a coach's name only when they
  create the coach, so a name set here sticks.
- `competitions.json5` — rename-only: classification lives in the
  batch 001 (see above). Its 36 entries normalize the
  recurring numbered competitions the two source systems named inconsistently
  (`Season N` / `Major Season N` / `tLoEGBBL Säsong N` all become `Major
Season N`; stray prefixes are stripped from Ogretoberfest, Chaos Cup and
  Dungeon Bowl entries; each track's unnumbered first instalment — e.g. bare
  `Chaos Cup` — is numbered `1`; and BBL's three identically-named `Reserves
Rumble` events become `Reserves Rumble 1`–`3`). Batch 001
  file already creates these under their canonical names and source importers
  never rename an existing competition, so this pass only changes a row a
  source importer created before it was curated there.
- `position-characteristics.json5` — hand-curated Move/Strength/Agility/Armour
  values for the three older rules sets no importer can supply correctly (CRP,
  CRP+, BB2016); `tools/import-bbl` deliberately writes no row for a rules set
  whose `agilityFormat` is `'bare'`, which is exactly those three. It sits in
  an **after** batch because its position references use the
  "`<raceName>: <positionName>`" `Name` external id that only
  `tools/import-bbl` creates, so those positions have to exist first. A
  _gap-fill_ entry — a `(position, rules set)` pair no importer can ever write
  — goes in batch 001's `position-characteristics-gap-fill.json5`
  instead (see [Position characteristics](index.md#position-characteristics)).
- `position-availability.json5` — hand-restored `positions_race_eras`
  availability the source data cannot evidence, from the rulebook rosters.
  It sits in an **after** batch for the same reason as the file above,
  spelled out in more detail: many of its position references use the
  "`<raceName>: <positionName>`" `Name` external id that only
  `tools/import-bbl`'s position importer creates. Curating before the
  importers would create an orphan position row
  under that id, and BBL's later upsert of the same real position would then
  see its own external id and that `Name` id point at two different rows,
  throwing `PositionUpsertConflictError`. Curating after ensures BBL has
  already established the position's identity, so these references resolve
  onto the existing row, not a duplicate.
- `trophy-awards.json5` — hand-curated winners of the two
  [`manual`-kind](#known-batch-001-dedup-files) trophies
  (Season MVP, Gudarnas Förkämpe), for which no importer records a
  winner. It sits in an **after** batch because each entry references a
  competition and a player by external id, both created by the BBL/TP
  importers.
- `position-skills.json5` — hand-curated starting skills
  (`position_rules_set_skills`) for CRP, CRP+ and BB2016, one entry per
  (position, rules set) carrying that position's whole skill list. Each entry's
  pair must already be curated in `position-characteristics.json5`, and each
  skill must have a category for that rules set in `skills.json5`; both are
  asserted by `curated-data-skills.spec.ts`. Star players under these three
  rules sets are absent because they have no curated characteristics to hang a
  starting skill off.

### Expected first-run import errors

`skills.json5`'s curated category table (`skill_rules_sets`) was fully
reconciled against every real BBL/TP skill name at the time it was written, so
a from-empty-database run of the BBL and TP importers against the same
downloaded data should see few or no "no curated category for rules set"
`ImportError`s. Any that do occur can only ever name `BB2020`, `DB2021`, or
`BB2025` — the only rules sets BBL and TP write starting skills to.
[`skills.json5`](#known-batch-001-dedup-files) does not curate
CRP/CRP+/BB2016 categories for every skill name — but BBL is deliberately
excluded from writing to those three rules sets (see
[import-bbl/file-format.md](../import-bbl/file-format.md)), and TP's own
config (`tools/import-tp/import-tp-config.json5`) only defines `BB2020`,
`DB2021`, and `BB2025` as rules sets, so neither importer can ever produce a
curation-gap error for CRP, CRP+, or BB2016.

The gap this error guards against is an ongoing one, not a one-time backlog:
as `download-tp` and BBL scraping pick up new skills over time — a newly
published star player, a newly observed skill variant — those will surface as
curation gaps needing a `skills.json5` update when they do. A skill with no
category there is reported and left out of that position's starting skills
rather than blocking the rest of the import.

A second, narrower error comes from the same curated rows: the TP importer
cross-checks each starting skill's `isElite` against the curated value and
reports an `ImportError` naming this file when the two disagree, once per
(skill, rules set) pair. It can only ever name `BB2025` — TP publishes the
marker on BB2025 skill masters only, and BBL supplies `false` unconditionally
because it has no concept of eliteness and is excluded from writing BB2025
starting skills anyway. Unlike the missing-category error, the starting skill
is still recorded: only the curated flag disagrees. Such an error means either
that BB2025 changed which skills are elite, or that TP started publishing the
marker on a skill this file has not caught up with — fix the curated row.

## Batch 003

`data/batches/003-after-reset-curated-names/` restates the curated name of
every coach, team, race, position, competition and skill that batches 001 and
002 curate; see [Batches](batches.md) for what it does and why. A new curated
rename goes into a new batch, restating `name` and the row's `externalIds`.
