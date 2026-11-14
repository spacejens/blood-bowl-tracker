# production-ops-cli

`tools/production-ops-cli` is a NestJS CLI application providing the
production database and network operations `deploy-production` invokes
instead of hand-rolling the equivalent shell. Worktree isolation is one
reason for this: a worktree-isolated session refuses to run shell commands
complex enough that it cannot verify they stay inside the worktree — see
[implement/SKILL.md's "Worktree isolation and shell commands" section](../../.claude/skills/implement/SKILL.md#worktree-isolation-and-shell-commands)
for what that means in practice. But the pattern is also useful on its own merits, independent of
that constraint: packaging multi-step logic (a detached tunnel process, a
validated read-only query) behind one tested command is more repeatable and
reliable than re-deriving the equivalent shell inline every time a skill needs
it.

## Subcommands

| Subcommand | Purpose |
| --- | --- |
| `check-production-config-port` | Verify an import tool's production config `apiBaseUrl` matches the expected tunnel port |
| `start-production-tunnel` | Start `deploy-production`'s `flyctl proxy` tunnel as a detached, pid-tracked process |
| `stop-production-tunnel` | Stop the tunnel started by `start-production-tunnel`, using its persisted pid |
| `run-production-query` | Run a read-only, timeout-enforced SQL query against production, reading it from stdin |
| `fetch-recent-discord-messages` | Fetch the N (1-100) most recent raw messages of a Discord channel, embeds included; `--before=<message-id>` fetches the N before that message instead, so a caller can page back through history |
| `fetch-discord-message` | Fetch one raw Discord message, embeds included, by its message link |
| `read-tp-feed-history` | Read a TP feed channel's whole history and save its advancement reports as local evidence; `--max-pages=N` stops after N pages of 100 |

## Running it

```bash
pnpm build
node tools/production-ops-cli/dist/main.js <subcommand>
```

Run from the repo root. On success, every subcommand prints JSON on stdout; failures print a JSON error on stderr and exit with status 1. `run-production-query` and the Discord subcommands additionally require `apps/discord-bot/.env.production` to be present in the checkout they run in, synced from the main checkout (see [deploy-production/SKILL.md](../../.claude/skills/deploy-production/SKILL.md)); they read it through `tools/cli-shared`'s `ProductionEnvFileService`, which parses it with dotenv, the same parser the bot itself uses, and never prints a value.

`run-production-query` runs `psql` through `tools/cli-shared`'s `PgClientService`, the same guarded runner `tools/backup-cli` uses: the libpq variables `PGHOSTADDR`, `PGHOST`, `PGSERVICE` and `PGSERVICEFILE` are removed from its environment so they cannot redirect the connection, the URL is passed as `--dbname=`, and the URL is redacted (password masked) from the reported `stdout` and `stderr` and from any error.

The Discord subcommands call Discord through the discord.js `REST` client (API v10), shared via one `DiscordRestService`, so they get discord.js's rate-limit handling and retries. The client is built once per process, on the first request, and reused, so discord.js's per-route rate-limit buckets span a whole loop of requests. The bot token is read only then, after the subcommand's own input validation. discord.js aborts and retries any attempt whose response headers take longer than 30 seconds. A Discord API failure is reported with the requested message or channel, the HTTP status, and Discord's error code and message; the bot token never appears in output.

Discord returns a page newest first. To page back, pass the `id` of the last (oldest) message of the previous page as `--before`. An empty page after a non-empty page means the start of the channel was reached. An empty first page can also mean that the bot lacks `READ_MESSAGE_HISTORY` in the channel, so confirm that permission before treating the channel as empty.

## Reading the TP feed history

```bash
node tools/production-ops-cli/dist/main.js read-tp-feed-history <channel-id> [--max-pages=N]
```

This reads the TP feed channel (the bot's `TP_FEED_SOURCE_DISCORD_CHANNEL_ID`,
see [TP notification feed](../discord-bot/tp-feed.md)) and keeps its
advancement reports as evidence. An advancement report is a webhook message
whose first embed's author is `New skill/characteristic`. The subcommand only
collects evidence; it does not change any player.

- **Paging.** It pages back with `before=<oldest id>`, 100 messages a page.
  Each run first catches up on messages newer than the newest one it saved
  (`after=<newest id>`, repeated while pages come back full). It then
  continues backwards until the start of the channel, or until it has
  fetched `--max-pages` pages in total. A short page means the start was
  reached.
- **Resuming.** The state is saved after every page. If a page still fails
  after discord.js's retries, or comes back in an unexpected shape, the run
  stops without an error exit. The summary names the failure, and a rerun
  resumes where it stopped.
- **Parsing.** Every saved message is re-parsed by
  [parse-tp-feed](../parse-tp-feed/index.md) on every run. The bot's ✔️
  reaction is recorded as `botReacted`, but only as a hint: a missing
  reaction can also mean the bot was down, its import failed, or scraping was
  off.
- **Summary.** It prints the pages fetched, the messages seen, the new
  reports saved, the number of unparsed reports, whether the channel start
  was reached, and the failure that stopped it, if any.

The input is validated before the bot token is read. The output lives in the
gitignored `tools/production-ops-cli/data/tp-feed-<channel-id>/`:

| File | Content |
| --- | --- |
| `messages/<id>.json` | The raw message, for advancement reports only. An existing file is never rewritten, so reruns are idempotent |
| `state.json` | The guild id, the newest and oldest fetched ids, and whether the start was reached |
| `reports.json` | Regenerated from the raw files on every run: team → `#number name (position)` → reports in message order, each with its parsed fields, message id, link, timestamp, raw text and `botReacted` |
| `unparsed.json` | Advancement messages whose gain or player line was not understood: the reason, message id and link |

`tools/fs-utils-cli`'s `sync-gitignored` links this directory back to the
main checkout from a worktree, so output written there survives the
worktree's removal. In a worktree created before this directory existed, run
`node tools/fs-utils-cli/dist/main.js sync-gitignored` first.

## Development

Its entrypoint runs on [cli-shared](../cli-shared/index.md)'s `runCli`
subcommand dispatcher, and it uses that package's shared helpers.

```bash
pnpm --filter @blood-bowl-tracker/production-ops-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/production-ops-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/production-ops-cli run verify      # build + lint + typecheck + format + test
```
