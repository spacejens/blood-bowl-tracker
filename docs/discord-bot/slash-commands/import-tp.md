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
  a competition page (`<base><tournament>`), a match page
  (`<base><tournament>/match/<id>`), a team roster page
  (`<base>roster/<id>`) or the official teams page (`<base>teams`). Anything
  else gets a private error naming these four kinds, and nothing is
  imported.
- `era` — optional. The era to import under, by name. Omitted, it is
  resolved automatically: a team from its race's one ongoing era, a match
  from its home team, and a competition from the one era its registered
  teams resolve to. A competition whose teams resolve to different eras, or
  to none, is not imported — re-run with `era` to force it through. The
  official team list has no era and ignores this argument.

The official teams page always imports every rules set TP has.

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

Below it, a line per import stage says how much it imported (for a
competition, match or team, also the era used), and an **Errors** section lists
every problem reported, labelled by stage. A very long reply is cut off at
Discord's embed limit.

It uses the same import code as `tools/import-tp`'s bulk import, registered
under `TP_EXTERNAL_SYSTEM_NAME`, which must match that tool's configured
external system name. See [import-tp-live](../../import-tp-live/index.md)
for what each import needs to already be in the database.

## Retriggering

`/importtp` appears in [`/debuginteractions`](debug-interactions.md)' listing
like any command. Retriggering it runs the import again (checking the
clicking member against the admin role), but that path does not defer its
reply, so a slow import's reply can fail to arrive there even though the
import itself runs.
