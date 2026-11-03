# Checking on the deployment

See [Production hosting](production-hosting.md) for the other pages.

```bash
fly status    # should show two machines, both in state "started"
fly logs      # live log stream from both running machines
```

A healthy startup shows the drizzle migrations applying (or nothing pending)
on both machines, one machine logging `Acquired the leader lock; becoming
active`, that machine logging in to Discord's gateway and posting the active
startup message to `STARTUP_MESSAGE_DISCORD_CHANNEL_ID`, and the other logging
`Another machine holds the leader lock; standing by`. The standby machine
also posts a standby message, unless `STANDBY_STARTUP_MESSAGE_ENABLED=false`
suppresses it (see [Production topology](production-topology.md)) — in that
case the standby log line is still the signal to look for, and the absence
of a Discord post is expected, not a failure. `fly logs` interleaves both
machines, prefixed by machine id.

Common failures and where they surface:

- **Missing or invalid configuration** — the bot is intentionally
  fail-fast, so a missing variable throws at startup (`DATABASE_URL is not
configured`, and similar) and the machine crash-loops. `fly status` shows
  repeated restarts; `fly logs` shows the thrown error. Fix the value and
  re-run `fly secrets import`. If the machine already hit Fly's max restart
  count (`fly status` shows `stopped` and `fly logs` shows "machine has
  reached its max restart count"), fixing the secret alone does not bring it
  back — explicitly restart it with
  `fly machine start <machine-id-from-fly-status>`.
- **Database unreachable** — a wrong or pooled `DATABASE_URL` shows as a
  connection error during migration in `fly logs`. Neon's free tier
  autosuspends its compute after a period of inactivity by design; the first
  connection after that incurs a brief cold-start delay while it resumes,
  which is normal and not itself a failure.
- **Bad image** — a failed build stops the `fly deploy` command itself,
  before anything is replaced; the previous machine keeps running.
- **Both machines standby, none active** — nothing is posted and slash
  commands go unanswered. Neither machine could take the advisory lock, which
  in practice means a third process holds it (a local bot pointed at the
  production database) or the lock connection cannot be opened at all;
  `fly logs` shows `Failed to reserve the advisory-lock connection` in the
  latter case.
- **A machine restarting after `Lost the leader lock while active`** — the
  active machine's dedicated lock connection dropped, which is fatal by
  design. A single occurrence is the intended reaction to a blip and the
  standby will already have taken over; a repeating loop points at the
  database dropping connections.
- **A machine restarting after `Failed to complete startup after connecting
to Discord; exiting`** — a step after a successful gateway connection
  (registering slash commands, starting the cron, or posting the startup
  message) failed. This is fatal by design too, for the same reason as
  above: once connected, releasing the lock and retrying would risk two
  live gateway sessions instead of one. Fly restarts the machine and it
  rejoins the election. Check the logged error for the underlying cause
  (a Discord API error, a misconfigured channel id, and similar).
- **One machine sits silent at startup while the other migrates** —
  `packages/db`'s migration step runs on both machines at boot, under a
  Postgres advisory lock (see [Migrations](../database.md#migrations)). The
  machine that does not get the lock waits until the other has finished
  migrating, then finds nothing left to apply and starts normally. This is
  expected whenever both machines start at the same moment with a pending
  migration (a deploy, `fly apps restart`, or a simultaneous crash-restart),
  and a long data migration makes the wait longer. No manual fix is needed; if
  the wait never ends, look at the other machine's logs for a stuck or failed
  migration.
