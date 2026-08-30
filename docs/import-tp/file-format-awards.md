# `awards_<slug>_awards.json`

An object keyed by TP category id (a string, e.g. `"22494"`), each value an
array — one entry per award given. The parser carries `id`, `awardType`
(numeric — see the code table below), the optional `name` (present only on
some award types, see below) and `inscription.roster.id`.

The coach/player identity fields — `inscription.player`, `inscription.players`
and `inscription.coachRank` — are deliberately not parsed: they are a less
complete duplicate of the coaches already imported from inscriptions (no NAF
fields), and TP records no individual player awards at all, so TP-sourced
competitions have no player awards today. That gap may be revisited from
another data source in a separate issue.

There are 13 awards files in the local reference dataset, one per competition
directory across the three era directories.

The `awardType` code scheme, confirmed against every entry in all 13 local
files:

| Code  | Meaning                    | Notes                                                             |
| ----- | -------------------------- | ------------------------------------------------------------------ |
| `1`   | 1st place                  | placement; `coachRank.score` present in the file but not parsed by the importer |
| `2`   | 2nd place                  | placement; `coachRank.score` present in the file but not parsed by the importer |
| `3`   | 3rd place                  | placement; `coachRank.score` present in the file but not parsed by the importer |
| `100` | Best Stunty / Wooden Spoon | fourth-era numbering — see `name` below                           |
| `200` | Best Stunty / Wooden Spoon | third-era numbering — see `name` below                            |

Placement entries (`1`/`2`/`3`) never carry a `name` field; `100` and `200`
entries always do, and it is exactly `"Best Stunty"` or `"Wooden Spoon"` —
that field, not the numeric code, is what tells the two trophies apart within
a single file. Cup-format files (each Ogretoberfest instance, the fourth-era
Chaos Cup, and one Dungeon Bowl season) carry only a `1` entry (a single
winner, no placements or stunty/spoon awards); season-format files carry `1`,
`2`, `3`, and, when present, the stunty/spoon pair.

The key finding, confirmed by reading every local file rather than assumed:
`100` and `200` are **the same two trophies under different legacy/current
numeric codes**, not two distinct trophies. All third-era season files
(`tloegbbl-major-season-25` through `tloegbbl-sasong-29`) use code `200` for
both `"Best Stunty"` and `"Wooden Spoon"`; the one fourth-era season file
(`tloegbbl-sasong-30`) uses code `100` for the identically-named pair. This is
a platform-side renumbering between eras, not two different trophies.

The nuance that makes a bare code unusable as an id: `awardType` codes are
**not globally unique per trophy**, even setting the `100`/`200` renumbering
aside. The same numeric code (`1`, `2`, `3`) means a different trophy
depending on which competition/tier it appears in — a Major season's `1` and
a Minor season's `1` are different trophies, exactly as BBL's
self-disambiguating `Major 1st` / `Minor 1st` labels show (see the `Note on
the sr page's "Team trophy" table:` and the trophy legend note in
`docs/import-bbl/file-format.md`). Resolving TP awards into
`trophies_external_ids` therefore needs the competition group each award
belongs to.

Competition groups arrived with issue #445, and issue #446 used them to key
TP trophy external ids as `${disambiguator}-${groupName}` — the same
hyphen-joined composite BBL positions use (`${typId}-${race.bblId}`). The
disambiguator is the award's `name` field when present (`Best Stunty`,
`Wooden Spoon`, which share one numeric code within a file) and the numeric
`awardType` otherwise (`1`, `2`, `3`); `groupName` is the curated competition
group's literal name. These ids are authored as literal strings in
`tools/import-manual/data/before-other-importers/trophies.json5`:

| Trophy                | TP external id              |
| --------------------- | --------------------------- |
| `Major Gold`          | `1-Major Season`            |
| `Major Silver`        | `2-Major Season`            |
| `Major Bronze`        | `3-Major Season`            |
| `Major Wooden Spoon`  | `Wooden Spoon-Major Season` |
| `Major Best Stunty`   | `Best Stunty-Major Season`  |
| `Chaos Cup`           | `1-Chaos Cup`               |
| `Ogretoberfest`       | `1-Ogretoberfest`           |
| `Dungeon Bowl Gold`   | `1-Dungeon Bowl`            |
| `Dungeon Bowl Silver` | `2-Dungeon Bowl`            |
| `Dungeon Bowl Bronze` | `3-Dungeon Bowl`            |

Those 10 catalog entries are seeded because TP has so far only tracked 4
competition groups (Major Season, Chaos Cup, Dungeon Bowl, Ogretoberfest).
Dungeon Bowl now has its own three catalog trophies — BBL never awarded a
Dungeon Bowl trophy, so `Dungeon Bowl Gold`/`Silver`/`Bronze` carry no BBL id.
These award files have so far only contained team-level entries: none of the
24 curated player trophies, and none of the BBL-only cups, appear anywhere in
this data, so the catalog still seeds no player trophies and no BBL-only cups
— no TP source data grounds them. Everything else in the catalog stays seeded
with BBL ids only. A new TP competition tracking a different group, or a new
award kind, would widen this set — the scope here reflects what TP has
tracked to date, not an architectural limit.

`tools/import-tp/src/trophy-awards/` consumes these ids: it reads each
competition directory's awards file, resolves the catalog trophy by
`${disambiguator}-${groupName}` (the group coming from the competition's own
`competitionGroupId`, curated in tools/import-manual's before-other-importers
phase), resolves the winning team's team era from `inscription.roster.id`
plus the competition's era, and writes a `trophy_awards` row with
`playerId: null`. An unresolvable row is recorded as an error and skipped,
never invented.
