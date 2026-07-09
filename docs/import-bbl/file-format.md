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

## Page types seen in the reference dataset

Fully handled in code (no notes needed): `tm` (team pages — coach and race
extraction).

Not yet handled (candidates for future work): `pl` (players), `m`/`mp` (matches
and per-player match stats), `ro` (rosters), `te` (league team list), `ch`
(per-season player top charts), plus others.
