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
star marker).

Not yet handled (candidates for future work): `m`/`mp` (matches
and per-player match stats), `ro` (rosters), `te` (league team list), `ch`
(per-season player top charts), plus others.

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
