# Curated data files

`tools/import-manual`'s committed data lives in two phase directories, and every
file in them exists for a specific reason — mostly to unify records the BBL and
TP importers would otherwise create as separate, duplicate rows. This page is
the reference for what each file holds. See [import-manual](index.md) for how
the tool is configured and run, and [Data layout](index.md#data-layout) for how
the two phases are laid out on disk.

## Known before-other-importers dedup files

A few `data/before-other-importers/*.json5` files exist specifically to unify
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
- `eras.json5` — the 8 eras the BBL and TP configs define, copied verbatim
  from `tools/import-bbl/import-bbl-config.json5` and
  `tools/import-tp/import-tp-config.json5`, which remain authoritative. It
  exists here purely so `competitions.json5` in the same phase has an era to
  reference.
- `competitions.json5` — all 86 known competition instances, each with its
  curated [competition group](index.md#competition-groups) and the real
  data needed to create the row. Classification has to happen
  here, ahead of the BBL and TP importers, because `tools/import-tp`'s awards
  import resolves a trophy by the competition's group name. Renaming stays in
  the after-other-importers phase.
- `races-and-positions.json5` — BBL/TP race and regular position name
  variants. `positions_race_eras` availability restoration is curated
  separately, in `position-availability.json5` (see below).
- `coaches.json5` — BBL's partial name vs. TP's full name for the same coach.
- `teams.json5` — team name variants.
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

## Known after-other-importers cleanup files

`data/after-other-importers/*.json5` files run once the BBL and TP importers
have created their records, to fix up names or attach external IDs the source
systems could not supply:

- `coaches.json5` — TP usernames replaced with a readable coach name. These
  names are pseudonymized (see [Data layout](index.md#data-layout)), so this is
  where a coach's displayed pseudonym is set.
- `competitions.json5` — rename-only: classification lives in the
  before-other-importers phase (see above). Its 36 entries normalize the
  recurring numbered competitions the two source systems named inconsistently
  (`Season N` / `Major Season N` / `tLoEGBBL Säsong N` all become `Major
Season N`; stray prefixes are stripped from Ogretoberfest, Chaos Cup and
  Dungeon Bowl entries; each track's unnumbered first instalment — e.g. bare
  `Chaos Cup` — is numbered `1`; and BBL's three identically-named `Reserves
Rumble` events become `Reserves Rumble 1`–`3`). Renaming cannot move to the
  earlier phase: it can only run once the importers have (re-)created their
  rows under the raw source names.
- `position-characteristics.json5` — hand-curated Move/Strength/Agility/Armour
  values for the rules sets no importer can supply correctly (CRP, CRP+,
  BB2016), plus BB2020 gap-filling. It sits in the **after** phase because
  the sync matches by the natural key `(position, rules set)` and updates in
  place, and the BBL importer can write its single BB2020-snapshot stat line
  under an older rules set on real usage evidence — curating before the
  importers would let that snapshot overwrite the curated values on the same
  key (see [Position characteristics](index.md#position-characteristics)).
- `position-availability.json5` — hand-restored `positions_race_eras`
  availability the source data cannot evidence, from the rulebook rosters.
  It sits in the **after** phase for a stricter reason than the file above:
  many of its position references use the "`<raceName>: <positionName>`"
  `Name` external id that only `tools/import-bbl`'s position importer
  creates. Curating before the importers would create an orphan position row
  under that id, and BBL's later upsert of the same real position would then
  see its own external id and that `Name` id point at two different rows,
  throwing `PositionUpsertConflictError`. Curating after ensures BBL has
  already established the position's identity, so these references resolve
  onto the existing row, not a duplicate.
