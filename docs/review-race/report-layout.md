# review-race report layout

Each sampled race gets one section in the report: a heading naming the race
and its database id, then the strata that selected it. Under it come two
panel pairs, each with every raw source (BBL, TP and manual curation, shown
together because a race has no single source) on the left and what the
importers stored on the right:

1. **race-and-availability** — what the race is and which positions it can
   field: race identity, then position availability.
2. **position-details** — what those positions are made of: characteristics,
   starting skills, then BB2025 keywords.

Each panel stacks its parts under small subheadings. A part that fails to
render shows a failure note in its own place only, and the rest of the panel
still renders. The red italic note style is used only for "no data found"
messages (no page in the mirror, no entry in a source file, no database row).

Star players are excluded from every position part, both raw and imported.
They are shared across races rather than owned by one, so a per-race report
is the wrong place to review them; see
[review-star-player](../review-star-player/index.md).

## race-and-availability

### Race identity

Left: BBL, TP and manual curation are all attempted together in one panel
(unlike other review tools' raw panels, which pick a single source based on
the sampled entity's own source), each contributing its own sub-table when
that source has data for the race. BBL's sub-table shows its race id,
race-list name, team-page name, team-page count and team codes — it carries
no cost or position data. TP's sub-table shows its `teamRace` code, the
official list's race name, the rules sets whose official list carries the
code, and how many positions it lists (a **count**, not a position list).
Manual curation's sub-table shows the curated name and its registered
external ids. A fourth sub-table, BBL/TP name agreement, compares BBL's and
TP's own names for the race — accounting for BBL's `<Race> Team(s)` suffix
convention — and renders a highlighted `MISMATCH` row when they disagree
beyond that convention. Right: the stored race identity, its eras, and every
external id for that race.

### Position availability

Left: raw BBL and TP source data showing which positions are listed for this
race in each source (a BBL position page that does not list the race is
rendered as a highlighted row with an explicit label `NOT LISTED`). TP's
rows are per rules set — the same position name under two rules sets is two
rows — because TP publishes one official team list per rules set. Plus a
manual curation sub-table sourced from `position-availability.json5` for the
rulebook rosters neither BBL nor TP can evidence. Right: the stored
availability data from `positions_race_eras` for each era this race covers.

## position-details

On the imported side the panel first checks that the race has stored
positions and an era mapped to a rules set. When either is missing, the whole
panel is one note saying so (`No positions stored for race "<name>", so no
position details to show.` or `Race "<name>" has no era mapped to a rules
set.`), rather than each part repeating it. The raw side has no such check:
its notes report missing source data per source, not database state.

### Position characteristics

Left: raw BBL and TP source data for this race's positions, showing
move/strength/agility/passing/armour (MA/ST/AG/PA/AV) per rules set — TP's
rows carry their own rules-set column, so a position's per-rules-set stat
lines sit side by side — plus manual curation's own characteristics for rules
sets neither source evidences the same way the database stores them. A BBL
position page that cannot be read, or that carries no characteristics table,
is rendered as a highlighted row naming the problem instead of being
silently dropped from the table. Right: the stored characteristics from
`position_rules_sets` for the same positions and rules sets, one sub-table
per rules set the race's eras map to, scoped to only the positions whose own
era(s) actually reach that rules set — a race spanning several eras never
cross-products every position against every rules set. A (position, rules
set) pair with no stored row, for a position that IS reachable under that
rules set, is rendered as a highlighted row carrying an explicit textual
label (`missing`), so the report stays readable without colour.

### Starting skills

Left: raw BBL, TP and manual curation sub-tables, shown together exactly like
the other race-scoped panels. BBL's sub-table reads its one rules-set-less
Skills cell per position page. TP's sub-table is per rules set — TP names
skills by a per-rules-set `skillMasterId`, resolved to a name from the
downloaded roster files where possible, shown as `skill master #<id>` when no
roster file explains it. Manual curation's sub-table is sourced from
`position-skills.json5`, for the rules sets neither source covers. None of
the three ever carries the random or elite marker — both are
advancement-only concepts a starting skill never has. Right: the stored
`position_rules_set_skills` rows, one sub-table per rules set the race's eras
map to, scoped to only the positions whose own era(s) actually reach that
rules set — a race spanning several eras never cross-products every position
against every rules set. A position with a characteristics row but no
starting skills renders `none`; a position that IS reachable under that rules
set but has no `position_rules_sets` row at all — so no row a starting skill
could hang off — is rendered as a highlighted row labelled `missing (no
characteristics row)`, mirroring how the characteristics panel highlights the
same absence.

Unlike the other parts, the raw and imported starting-skills parts are never
diffed against each other: BBL's skills carry no rules set, TP's carry
per-rules-set ids, and the curated file carries `Name` external ids, so
lining them up against the stored rows would mean re-running the importers'
own resolution logic — the very thing under review. The two panels are shown
side by side purely for a human reviewer to compare by eye.

### Keywords

The raw subheading reads _Keywords (TP codes and manual curation)_: only TP
publishes keywords, so this is the one raw part with no BBL sub-section.

Left: a TP sub-table, one row per (position, rules set) TP publishes,
showing its numeric keyword codes — merged from the `race` array, the
`positionTypes` bitmask and the `isBigGuy` flag — resolved against the
curated catalogue (`Goblin (111)`), alongside the raw `positionTypes` and
`isBigGuy` values TP carries so a reviewer can check the decode without
reading the JSON by hand, with a code the catalogue does not name rendered as
a highlighted row (`777 — not curated`); plus a manual-curation sub-table
listing the whole curated catalogue once, not per position, so a reviewer can
see the names codes are read against without leaving the report. BBL has no
keyword concept. Right: the stored `position_rules_set_keywords` rows, one
sub-table per rules set the race's eras map to, scoped to only the positions
whose own era(s) actually reach that rules set — a race spanning several eras
never cross-products every position against every rules set — with the same
`none` rendering as the starting-skills part and a highlighted `missing` row
(not `missing (no characteristics row)`) for a position reachable under the
rules set but with no stored row at all. As with starting skills, the raw and
imported parts are never diffed against each other — TP's codes are resolved
through this tool's own independent catalogue reader, not the importer's, so
the two panels are shown side by side purely for a human reviewer to compare
by eye.
