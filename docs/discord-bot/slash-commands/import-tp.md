# `/importtp`

`/importtp` imports whatever TP (tourplay.net) page a URL points to, right
away: a competition with its registered teams and trophy awards, one
completed match with its teams and competition, one team roster, or TP's
official team list. It lets a league administrator pull in TP data without
waiting for automatic imports, and recover when those missed something.

Access is limited to the league-administrator role: where the deployment
sets `ADMIN_COMMAND_ROLE_ID` to a Discord server role id, only members
holding that role can run it — anyone else gets a private "you don't have
permission to use this command" reply, as does anyone running it in a direct
message with the bot. Where that variable is unset, the command is open to
everyone who can see it. This role is separate from the `debug` role that
gates the maintainer commands.

## Arguments

- `url` — required. The TP page to import. It must be under the configured
  `TP_FRONTEND_BASE_URL` (normally `https://tourplay.net/en/blood-bowl/`):
  a competition page (`<base><tournament>`, or any page under it such as
  `<base><tournament>/news`), a competition's scores page
  (`<base><tournament>/scores`), a match page
  (`<base><tournament>/match/<id>`), a team roster page
  (`<base>roster/<id>`) or the official teams page (`<base>teams`). Anything
  else gets a private error saying so, and nothing is imported.
- `era` — optional. The era to import under, by name. Omitted, it is
  resolved automatically: a team from its race's one ongoing era, a match
  from its home team, and a competition from the one era its registered
  teams resolve to. A competition whose teams resolve to different eras, or
  to none, is not imported — re-run with `era` to force it through. The
  official team list has no era and ignores this argument.

The official teams page always imports every rules set TP has.

A competition imported for the first time — by its competition page, or as
a side effect of importing one of its matches — also has every completed
match TP already records for it imported; a match import that creates its
competition imports the competition's registered teams too. To backfill the
completed matches of a competition that was already imported, give its
scores page URL: that always runs the match backfill. Once TP has published a
competition's awards (it is finished), the import also awards the trophies TP
does not record itself, and only then sets the competition's end date. This
applies to a competition page import and to a match import that creates the
competition.

## The reply

The command acknowledges at once and replies privately (ephemerally) when
the import finishes, since fetching from TP can take a while. The reply is
one embed titled after the page imported, starting with a status:

- **Completed** — every stage succeeded.
- **Completed with errors** — the import happened, but some stage reported
  problems (a team whose coach is unknown, an award for an unlinked team,
  and so on). The imports collect such problems rather than stopping, so
  this is a normal partial success.
- **Failed** — the main thing was not imported: the competition, the match,
  the team, or every rules set of the official team list.

Below it, a line per import stage says how much it imported (a
competition's TP trophy awards are followed by an **Extra trophy awards** line
counting those awarded beyond what TP records; for a competition, match or
team, also the era used), and an **Errors** section lists
every problem reported, labelled by stage. Any backfill the import ran gets
its own lines after the import's own stages: for a match import that created
its competition, these are the backfilled teams, participation and trophy
awards, a **Backfilled extra trophy awards** line counting the extra trophies
awarded once the competition turned out to be finished, and the **Matches
backfill**. When TP returned awards, so the extra trophies were due, but the
match backfill reported errors, the **Backfilled extra trophy awards** line
instead carries one error saying the extra trophies were skipped. Without TP
awards there is nothing to skip: that line shows zero and no error. The same
holds for a scores-page `/importtp` (a forced backfill): when TP returned
awards and its match backfill reports errors, the competition import's own
**Extra trophy awards** line carries the skipped error. When the errors do not
all fit within Discord's embed limit, the reply lists the first ones that do and
ends with a line saying how many more were left out, such as "…and 12 more
errors not shown."; when the first error is itself too long to fit, it is cut
short and the note still says how many more were left out.

If the import breaks outright instead of collecting its problems — the
database being unreachable, say — the reply is an embed titled **TP import
failed** with the **Failed** status and the error's message under
**Errors**, rather than a bare generic failure. The error is also logged on
the server. Since the command still replies normally, such a run shows as a
success in [`/debuginteractions`](debug-interactions.md); the reply itself
is what tells the admin it failed.

It uses the same import code as `tools/import-tp`'s bulk import, registered
under `TP_EXTERNAL_SYSTEM_NAME`, which must match that tool's configured
external system name. See [import-tp-live](../../import-tp-live/index.md)
for what each import needs to already be in the database.

A backfill fetches every completed match one at a time, paced the same way
every other TP fetch is. On a competition with a very large number of
completed matches, this can take long enough that Discord's interaction
token expires before the reply is sent — the import still finishes and its
data still lands, but the admin sees no reply for it. Checking whether the
import worked then means looking at the data or the server logs directly,
not the command's reply.

## Retriggering

`/importtp` appears in [`/debuginteractions`](debug-interactions.md)' listing
like any command. Retriggering it runs the import again (checking the
clicking member against the admin role), but that path does not defer its
reply, so a slow import's reply can fail to arrive there even though the
import itself runs.
