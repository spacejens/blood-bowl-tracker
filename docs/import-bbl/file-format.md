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
external id. A competition's `type` is inferred from its match-date span:
`(latest - earliest) <= 3 days` => `cup`, else `season`. Validated against all 74
competitions in the reference dataset, including "Dungeon Bowl 1" (a 191-day
season across only 4 matches) and "Stunty Leeg 2" (a season abandoned after 6
days); the nearest genuine cup spans at most 2 days, so 3 days has wide margin.

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

Known limitation: "result added" is when a result was entered into the
website, not necessarily when the match was played — a season whose results
were backfilled in one sitting (rather than entered as they happened) can show
a 0-day span indistinguishable from a genuine one-day cup. "Stunty Leeg 1"
(11 matches, 0-day span) is a known instance: it misclassifies as `cup` but is
almost certainly a season, matching "Stunty Leeg 2". No date-span threshold
can fix this — roughly 20 genuine one-day cups share the same 0-day span. Left
as-is; correct manually in the database if it matters, the same way any future
similar case should be handled.

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
