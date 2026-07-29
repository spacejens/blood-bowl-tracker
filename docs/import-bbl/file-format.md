# BBL source file format — working notes

Temporary notes on the BBL `wget` mirror format, used to coordinate between
development sessions. **Remove an entry once its detail is fully encoded in
code** — the code is the source of truth at that point.

## General

- Files are named `default.asp?p=<type>&<params>` (e.g. `default.asp?p=tm&t=knu`).
  The `p` query param is the page type; remaining params identify the entity.
- Encoding is ISO-8859-1 (Latin-1) with CRLF line endings. Some files contain
  stray/extended-ASCII bytes — decode with Latin-1, which never throws.
- Non-page files (`index.html`, `wget-*.txt/log`) and asset subfolders
  (`badges/`, `gfx/`, `pics/`) are ignored by the reader (they have no `p=`).

## Entity identifiers

- Most BBL entities have a stable id exposed in links to the entity's own page
  (not only in the linking file's params). The id may be numeric — the `Race:`
  field on a team page links the race as `default.asp?p=tl#<id>`, whose fragment
  (`16` for "Orc Team") is the race's canonical BBL id — or alphanumeric, as for
  teams. Some entities (e.g. coaches) have no id at all.
- Convention: key an entity by that id under the **BBL** external system and by
  its display name under the **Name** external system. Fall back to name-only
  keying (as coaches and leagues do) when the source exposes no id. This applies
  to future page types too — look for the id in the link to the entity's own
  page, not just the name text.

## tm page fields

- The team name on a `tm` page is the page's `<h1>` heading (e.g.
  `<h1>40 grinders</h1>`), not a labelled `<td>` cell like `Race:`/`Coach:`.
  The team's own id is the page's `t` param (e.g. `40g`, `äng`). Retired teams
  additionally show a "Retired!" marker (not tracked yet).

## Page types seen in the reference dataset

Fully handled in code (no notes needed): `tm` (team pages — coach and race
extraction), `pt` (position/player-type pages — name, "Can play for" races, and
star marker), `tl` (master race-list page — see the note below).

Not yet handled (candidates for future work): `mp` (per-match scores, gate, TD
scorers, and sendings-off). Per-match **identity** (BBL id, date, competition)
is imported straight from the `ma` list rows — see the note on `ma` pages
below. The `m` detail page is read separately, for each match's two teams and
its display name — see the note on `m` pages below. Also not yet handled: `ro`
(rosters), `te` (league team list), `ch` (per-season player top charts), plus
others.

Note on `pt` pages: the `<h1>` is the position's display name and the "Can play
for:" section lists its race(s) as `default.asp?p=tl#<raceId>` links (the same
fragment convention team pages use for races). A position may list zero, one, or
several races; the zero-race case (a present-but-empty "Can play for" table)
means there is no race to assign the position to. A page may also carry a
`None (star player)` skill-category cell, which marks the position as a star
player. Star players and a few ordinary positions list no race under "Can play
for"; their race(s) are recovered from player pages instead.

Note on `pl` pages: only two links are read — the player's position
(`default.asp?p=pt&typID=<id>`) and team (`default.asp?p=tm&t=<code>`). This is
not a full player import; no `players` rows are written. It exists so the
positions import can resolve the race of a position whose `pt` page lists none.

Note on `se`/`sr` pages: `default.asp?p=se&s=<id>` ("played"/archived
competitions) and `default.asp?p=sr&s=<id>` (current standings) share one
numeric id space. Every `se`/`sr` page embeds the identical master dropdown
`<option value="default.asp?p=se&s=<id>"><name></option>` listing every
competition, so one page is enough to get the full id/name list (the same
"master list on every page" pattern the `tl` race list uses). The `p=cp&cpid=`
pages look competition-like but are generic static content pages (league
structure, news, gallery) — not reliably competitions — and are out of scope.

Note on `ma` pages: `default.asp?p=ma&so=s&s=<id>` is a competition's match
list. It has no explicit type or date field except each match row's
`title="result added <Month> <Day><suffix>, <Year>"` attribute (e.g.
`result added September 25th, 2021`) — the only date source without a full match
import. The `&gr=` variant of this URL is a byte-identical duplicate (a
group-filter UI artifact); dedupe by the `s` param, keeping the first page seen.
The `so=t` variant is a different, team-sorted view (keyed by `t`) and is not
used here. Each match row's `onclick` (e.g.
`self.location.href='default.asp?p=m&m=<id>'`) carries the match's
globally-unique numeric id; the matches import uses this as the match's BBL
external id. For every competition other than those covered by
`seasonCompetitionIdOverrides`/`cupCompetitionIdOverrides` (see `eras` in
[index.md](./index.md)), `type` is inferred from its match-date span:
`(latest - earliest) <= 3 days` => `cup`, else `season`. Validated against the
71 non-overridden competitions in the reference dataset; the nearest genuine
cup spans at most 2 days, so 3 days has wide margin.

Note on the `sr` page's "Team trophy" table: `default.asp?p=sr&s=<id>` carries a
`table.tblist` whose header `<th>` reads "Team trophy" (present on 55 of the 73
mirrored `sr` pages; e.g. "Ogretoberfest 6", `s=46`, has none — a competition
may simply not have one). Each row is a `tr.trlist` with
`onclick="self.location.href='default.asp?p=tm&t=<code>';"` identifying the
team, and a label cell such as `Major 1st`, `Major 2nd`, `Major 3rd`, `Major
Wooden Spoon`, or `Minor 1st` — the prefix ("Major"/"Minor"/etc.) is
competition-type-specific and not itself meaningful; only the `1st`/`2nd`/`3rd`
suffix identifies a placement. The same table can also hold non-placement award
rows (e.g. `Cabal Vision Cup`), which are ignored.

Note on `m` pages: `default.asp?p=m&m=<id>` is a single match's detail page.
Its two teams are read from the `<a href="default.asp?p=tm&t=<id>">` links in
the first `table.tblist tr.trborder` row's two `<td width="180">` cells (home
first, away second). Its display name is the text after the comma in the bold
header wrapping the competition link, e.g. `<b><a href="...p=ma...">Season
4</a>, 11 - 12</b>` => name `"11 - 12"`, or `..., Bierhallentodball</b>` => name
`"Bierhallentodball"` (the special cup-final label BBL uses for four-team
Ogretoberfest finals, which this project stores as one merged match — see
`MatchMergeService`). Names are not unique across matches (e.g. "Final"
recurs every season) and are never used as an external id.

Administrative match events on `m` pages: an `m` page's two label tables (an
achievement table and a "Sustained Injuries" table) plus a freeform "Match
notes" box are the only structured content. A full sweep of all match-detail
pages found that nine of TP's administrative event/consequence types have **no
structured BBL source** and are deliberately not imported: weather rolls,
inducements rolls, winnings rolls, fan factor rolls, prayers to Nuffle,
dedicated fans, secret objectives, expensive mistakes, and concessions. Where
these appear at all, they are freeform "Match notes" prose on well under 1% of
matches (most have zero occurrences), which is not a parseable field. Two facts
BBL _does_ support are imported: the `-1 PA` passing stat-loss injury (a normal
Sustained-Injuries row, handled like `-1 MA/ST/AG/AV`) and a lower-bound
journeyman-signing count (below).

Journeyman-count lower bound: BBL delinks a journeyman player to the bare text
`journeyman` with no id, so journeymen cannot be told apart and an exact count
is impossible. A **minimum** count per team per match is derived from
casualty-consequence exclusivity — a player who receives a removal consequence
(`miss_next_game`, `niggling_injury`, any `stat_reduction_*`, `death`, or
`sent_off`) is out for the match and cannot receive a second, so every distinct
`journeyman` mention across a team's removal-consequence rows proves a distinct
journeyman was fielded. Per side: `removalCount` = number of `<br>`-separated
cell segments across that team's removal rows whose text is exactly
`journeyman` (no link); `floor` = 1 if `journeyman` appears anywhere in that
team's cells (catching achievement-row-only mentions); the emitted
`journeymenCount` is `max(floor, removalCount)`, and one `journeymen_signings`
event is emitted per side with a positive count. This is why BBL's
`journeymenCount` is a proven minimum, not TP's exact per-roster count.

Multi-entry cells: an event cell's `<br>`-separated segments are read one by
one — `<br>` is the only separator BBL uses between entries in a cell, so a
cell with no `<br>` is always exactly one segment. A segment is not the same
as an occurrence, though: a segment with player links yields one occurrence
per link, so a `<br>`-less cell can still produce several occurrences. A
link-less segment is classified against a closed vocabulary of plain-text
annotations (the list below), so an unlinked entry survives alongside a
linked one in the same cell and several unlinked entries stay several
occurrences.

The vocabulary, taken from a survey of every mirrored match-detail page:

| Segment text | Meaning |
| --- | --- |
| `fans / random event` | unidentified participant, kind `fans_or_random_event` |
| `mercenary / fans / random event` | unidentified participant, kind `mercenary_or_fans_or_random_event` |
| `mercenary / star` | unidentified participant, kind `mercenary_or_star` |
| `journeyman` | unidentified participant, kind `journeyman` |
| `mercenary` | unidentified participant, kind `mercenary` |
| `victim healed by apoth` | casualty prevented by an apothecary (consequence rows only) |
| `victim regenerated` | casualty prevented by regeneration (consequence rows only) |
| `foul` | a casualty caused by a foul whose fouler BBL does not identify (casualty action rows only) — the same construct as `foul by <player link>`, minus the link |
| `Extra shoot-out TD after tied overtime` | a known note, deliberately not an occurrence and not an error |

BBL's own ambiguity is preserved rather than resolved: `mercenary / star`
becomes one value meaning "a mercenary or a star player, the source does not
say which". A journeyman or mercenary is a real player BBL merely does not
index, which is why the stored field is called *unidentified* participant kind
rather than "non-player".

`Extra shoot-out TD after tied overtime` is ignored rather than treated as an
entry, because it annotates the touchdown beside it instead of naming another
scorer — but it is worth keeping in the vocabulary rather than dropping,
because it is the only per-side signal of who won a match that was still drawn
after overtime. A shoot-out touchdown decides such a match without changing the
score the rest of the page reports, so the side whose `TD Scorers` cell carries
this note is the winner. Nothing in the model records that today; a match
decided this way is currently indistinguishable from a draw.

Two caveats for whoever picks that up. The note is rare and not reliably
present: three mirrored matches went to a shoot-out and only one of them
(`m=1892`) marks the deciding touchdown this way. And the accompanying
prose — a `colspan=3` cell reading "This match went into overtime and was
decided on a penalty shoot-out", present on all three — is not reachable from
here at all, since the row walk requires exactly three cells. Recording
shoot-out results properly therefore needs a separate pass over those
merged-cell rows, not just this annotation.

A prevented casualty is stored as `consequence_type = 'casualty_avoided'` with
the prevented severity in `consequence_avoided_severity`, never as the severity
itself, so no casualty-suffered statistic counts it as a real casualty. It is
correlated with a causer action on exactly the same terms as a real casualty of
the same severity: when a severity group holds exactly one candidate action and
exactly one candidate consequence, the two merge into a single event — and that
merged event still records the consequence as `casualty_avoided` with the
prevented severity, not as the severity itself. When two or more consequence
candidates share a group (any mix of real and prevented — say one player killed
outright and another saved by an apothecary), attribution is ambiguous and
nothing merges: the action and each consequence are emitted as separate events,
so no occurrence is lost.
The same all-or-nothing rule covers the cross-team case peculiar to a merged
four-team match: because a consequence's candidate actions are drawn from every
team other than the acting one, two teams' actions can each be the only
plausible cause of one consequence. That contention is resolved before anything
is committed, and it likewise merges nothing — both actions and the consequence
are emitted as separate events rather than the first team in source order
silently claiming it.

Placement is validated against the row's actual resolved type, not just
achievement-vs-injury: a bare `foul` is only valid in a casualty-severity
action row (`badly_hurt`, `serious_injury`, `death` — e.g. rejected in `TD
Scorers`, where it would otherwise silently turn a touchdown into a foul), and
an avoided-consequence annotation is only valid in an injury-severity
consequence row (`badly_hurt`, `serious_injury`, `death`, `miss_next_game`,
`niggling_injury`, any `stat_reduction_*` — e.g. rejected in `Sent off`, which
is a removal but not an injury and cannot sensibly be "avoided"). Anything
else in a link-less segment, any known annotation misplaced this way, and any
leftover unclassifiable text sitting alongside a player link in the same
segment, produces no occurrence for that text and is reported as a non-fatal
import error naming the match, the row and the text (the linked player's own
occurrence is still emitted). Guessing would re-introduce exactly the data
loss this handling exists to prevent if the mirror's wording ever changes.

Known limitation: "result added" is when a result was entered into the
website, not necessarily when the match was played — a season whose results
were backfilled in one sitting (rather than entered as they happened) can show
a 0-day span indistinguishable from a genuine one-day cup. Roughly 20 genuine
one-day cups share that same 0-day span, so no date-span threshold can
distinguish them from a backfilled season. Three known instances need `eras`
overrides, each for a different reason:

- "Stunty Leeg 1" (`s=30`, 0-day span) is a genuine type-classification
  ambiguity — a 0-day span is indistinguishable from a real one-day cup using
  the heuristic alone — but is resolved correctly via
  `cupCompetitionIdOverrides` regardless.
- "Stunty Leeg 2" (`s=33`, 6-day span) is a genuine type _correction_: the
  date-span heuristic would compute `season` (6 days is over the 3-day
  cutoff), but it was actually a `cup`. `cupCompetitionIdOverrides` corrects
  the type, not just the era.
- "Dungeon Bowl 1" (`s=69`, 191-day span) has no type-classification issue at
  all — the heuristic already computes `season` correctly on its own. Its
  only problem is _era_ assignment: its dates would otherwise fall in
  whichever regular era covers that date range. `seasonCompetitionIdOverrides`
  fixes the era assignment.

Any future similar case should be handled the same way.

Note on the `tl` page: `default.asp?p=tl` (no further params) is a single
per-league master race-list page. Each race is introduced by two anchors — a
name anchor and a numeric-id anchor, e.g.
`<a name="CollegeofShadow"></a><a name="48"></a>` — where the numeric one (`48`)
is the race's canonical BBL id (the same fragment used in `default.asp?p=tl#<id>`
links elsewhere). The next `<b>` after the numeric anchor holds the race name;
later `<b>` rows on the same race are roster lines, not names. This list is not a
strict superset of the races `tm` pages reveal: a race no longer offered by the
league can be dropped from it while still attached to old/retired team pages
(id `22` in the reference dataset), so the races import treats `tm` pages as
authoritative and uses `tl` only to fill in races with no team page.
