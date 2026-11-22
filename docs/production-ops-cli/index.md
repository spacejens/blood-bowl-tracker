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
| `generate-incomplete-player-fills` | Plan the manual-import fills of incomplete TP players whose data can be proven, read-only from production, optionally with the TP feed evidence `read-tp-feed-history` saved (`--feed-channel=<channel-id>`) and the roster snapshot evidence `read-tp-roster-snapshots` saved (`--snapshots`); prints the batch file and a report, or writes the file with `--out=<repo-relative-path>` |
| `fetch-recent-discord-messages` | Fetch the N (1-100) most recent raw messages of a Discord channel, embeds included; `--before=<message-id>` fetches the N before that message instead, so a caller can page back through history |
| `fetch-discord-message` | Fetch one raw Discord message, embeds included, by its message link |
| `read-tp-feed-history` | Read a TP feed channel's whole history and save its advancement reports as local evidence; `--max-pages=N` stops after N pages of 100 |
| `read-tp-roster-snapshots` | Read every downloaded TP match and roster file and save what each shows of every player, as evidence for `generate-incomplete-player-fills --snapshots` |

## Running it

```bash
pnpm build
node tools/production-ops-cli/dist/main.js <subcommand>
```

Run from the repo root. On success, every subcommand prints JSON on stdout; failures print a JSON error on stderr and exit with status 1. `run-production-query`, `generate-incomplete-player-fills` and the Discord subcommands additionally require `apps/discord-bot/.env.production` to be present in the checkout they run in, synced from the main checkout (see [deploy-production/SKILL.md](../../.claude/skills/deploy-production/SKILL.md)); they read it through `tools/cli-shared`'s `ProductionEnvFileService`, which parses it with dotenv, the same parser the bot itself uses, and never prints a value.

`run-production-query` runs `psql` through `tools/cli-shared`'s `PgClientService`, the same guarded runner `tools/backup-cli` uses: the libpq variables `PGHOSTADDR`, `PGHOST`, `PGSERVICE` and `PGSERVICEFILE` are removed from its environment so they cannot redirect the connection, the URL is passed as `--dbname=`, and the URL is redacted (password masked) from the reported `stdout` and `stderr` and from any error.

The Discord subcommands call Discord through the discord.js `REST` client (API v10), shared via one `DiscordRestService`, so they get discord.js's rate-limit handling and retries. The client is built once per process, on the first request, and reused, so discord.js's per-route rate-limit buckets span a whole loop of requests. The bot token is read only then, after the subcommand's own input validation. discord.js aborts and retries any attempt whose response headers take longer than 30 seconds. A Discord API failure is reported with the requested message or channel, the HTTP status, and Discord's error code and message; the bot token never appears in output.

Discord returns a page newest first. To page back, pass the `id` of the last (oldest) message of the previous page as `--before`. An empty page after a non-empty page means the start of the channel was reached. An empty first page can also mean that the bot lacks `READ_MESSAGE_HISTORY` in the channel, so confirm that permission before treating the channel as empty.

## Generating incomplete-player fills

`generate-incomplete-player-fills` runs read-only queries through the same
guarded `psql` as `run-production-query`, one per kind of row. The query
runner has a `tuplesOnly` mode for this: it passes `psql` its tuples-only
flag so the output holds just the result. Each query is wrapped in
`json_agg`, so that output is parsed as JSON. The selection repeats
game-data's `INCOMPLETE_PLAYER_CRITERIA` in SQL, and a spec keeps the two in
step. A competition counts as ongoing when it has a `tourplay.net` id and no end
date: the TP importers store an end date only once TP shows the
competition finished, so one that has ended but is not fully imported still
counts. No list of competition names is kept, and a run with no ongoing
competition skips no team for that reason.
What it selects and why is described in
[Filling in missing players](../import-manual/filling-missing-players.md#generated-fills).
A trophy award makes its player a free-skill risk only when the trophy is
curated as granting a skill (`game_data.trophies.grants_skill`) or the award
records a granted skill, so the queries need a database whose migrations
include that column. They also read `game_data.rules_sets.lasting_injuries_never_heal`
to tell which rules sets never heal lasting injuries, so its migration is
needed too.

The output is JSON: `report` counts the players considered and filled, and
lists the skipped players' TP ids under each reason.
`report.ongoingCompetitions` lists the competitions treated as ongoing,
each with its id, name and `teamCount` (distinct teams enrolled in it or
playing one of its matches), so the set of skipped teams can be checked;
it is empty when none is ongoing. The batch file also
gets a `lastingInjuryRepairs` section listing every complete non-star TP
player with a stat reduction recorded in a match and none stored whose
stored line shows a reduction the server would record (see
[Recording lasting reductions](../import-manual/filling-missing-players.md#recording-lasting-reductions)).
`LastingInjuryRepairSelectorService` derives each candidate's counts from
his stored line, active characteristic increases and the rules set context
the query resolves, the way game-data's `PlayerFillReductionsService` does,
and leaves out every candidate with nothing to record.
`report.lastingInjuryRepairs` counts the listed players and
`report.lastingInjuryRepairsNothingToRecord` the ones left out. `section`
holds the batch file when no `--out` is given. With `--out`, the file is
written through cli-shared's `WriteFileService` and `written` reports it. A run with `--out`,
no eligible player and no repair writes nothing and fails, with the report
in the error message so the skipped players and their reasons are still
visible.

`--feed-channel=<channel-id>` reads
`tools/production-ops-cli/data/tp-feed-<channel-id>/reports.json`, the
evidence `read-tp-feed-history` saves (see
[Reading the TP feed history](#reading-the-tp-feed-history)), before any
query runs. A missing or malformed file stops the run. Without the flag,
players are not filled from feed reports; the other fills still run.
`report` also gives `eligibleByStage` (fills with no advancements, from
the feed with or without lasting injuries, with lasting injuries only,
from snapshots, and from the feed completed by snapshots)
and `feed` (how many feed player keys gave their reports to stored
players, stayed ambiguous, or named no stored TP player of a candidate's
team who can afford their reports; `null` without the flag; see
[Generated fills](../import-manual/filling-missing-players.md#generated-fills)).
`journeymenFilled` counts the entries filled as journeymen
(`journeyman: true`), which `eligibleByStage.noAdvancement` also counts.

`--snapshots` reads
`tools/production-ops-cli/data/tp-roster-snapshots/snapshots.json`, the
evidence `read-tp-roster-snapshots` saves (see [Reading the TP roster
snapshots](#reading-the-tp-roster-snapshots)), before any query runs. A
missing or malformed file stops the run. Without the flag, players at or
above the cheapest advancement whom the feed does not name stay
`spp-too-high`; with it and without `--feed-channel`, every such player
goes to the snapshot stage, which also needs his stored unspent SPP to
equal the snapshot's. With both flags, a player the feed names whose
reports do not add up to the SPP he spent also goes to the snapshot stage,
with his reports fixed in place; `report.eligibleByStage.feedWithSnapshot`
counts those fills. The evidence file's age is not checked, so run
`read-tp-roster-snapshots` again after downloading. The queries also read
every skill's and every candidate position's `tourplay.net` ids, and the
skills held with a variant anywhere. `report.eligibleByStage.snapshot`
counts the snapshot fills. See [Generated
fills](../import-manual/filling-missing-players.md#generated-fills).

The package depends on `@blood-bowl-tracker/domain-enums` for the status,
characteristic-format, skill, advancement-kind and match-event enums.
`@blood-bowl-tracker/db` and `@blood-bowl-tracker/game-data` are dev
dependencies, used only by three drift-guard specs. One keeps the SQL
selection in step with `INCOMPLETE_PLAYER_CRITERIA`. Another runs the
generator's advancement pricing next to game-data's own order check
(`AdvancementOrderDeductionService`) and requires the server to accept
exactly the spend the generator prices. The third runs the repair
selector's reduction counts next to game-data's
`PlayerFillReductionsService` and requires both to agree.

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
  used up `--max-pages` pages. A catch-up page counts towards that budget
  only when it is full (more may be waiting); an empty or short catch-up
  page ends the catch-up and is free, so `--max-pages=1` reruns still move
  backwards. A short page while paging backwards means the start was
  reached. The summary's pages fetched counts every successful request,
  free ones included.
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
  was reached, and the failure that stopped it, if any. An empty first page
  reports `reachedStart: true` with `messagesSeen: 0`, which can mean the bot
  lacks the Read Message History permission, not only an empty channel.

The input is validated before the bot token is read. The output lives in the
gitignored `tools/production-ops-cli/data/tp-feed-<channel-id>/`:

| File | Content |
| --- | --- |
| `messages/<id>.json` | The raw message, for advancement reports only. An existing file is never rewritten, so reruns are idempotent |
| `state.json` | The guild id, the newest and oldest fetched ids, and whether the start was reached |
| `reports.json` | Regenerated from the raw files on every run: team → `#number name (position)` → reports in message order. Each report is self-contained: the team name, player number, name and position, the parsed fields, message id, link, timestamp, raw text and `botReacted` |
| `unparsed.json` | Advancement messages whose gain or player line was not understood: the reason, message id and link |

`tools/fs-utils-cli`'s `sync-gitignored` links this directory back to the
main checkout from a worktree, so output written there survives the
worktree's removal. In a worktree created before this directory existed, run
`node tools/fs-utils-cli/dist/main.js sync-gitignored` first.

## Reading the TP roster snapshots

```bash
node tools/production-ops-cli/dist/main.js read-tp-roster-snapshots
```

- **Input.** Every `match_<id>.json` and `rosters_<id>.json` under
  `tools/import-tp/data` (download-tp's files), found by name, so
  `rosters_masters?ruleSet=N.json` is not read. In a worktree the directory
  links to the main checkout's; run `sync-gitignored` first if it is
  missing.
- **What is read.** Of each line-up entry: the TP player id,
  `lineUpMasterId`, `level`, the skill ids, `totalStarPlayerPoints` and
  `starPlayerPoints` (unspent). A match lists starting and gained skills
  together. A roster lists the gained skills on the player and the starting
  skills on his position template, and the two are listed together.
- **Output.** `snapshots.json` in the gitignored
  `tools/production-ops-cli/data/tp-roster-snapshots/`, regenerated on every
  run. `players` maps a TP player id to each distinct state with its source
  files. `conflicts` lists the players shown in more than one state.
  `unreadable` lists the files of another shape, with the reason. Neither
  stops the run.
- **Summary.** Match and roster files read, unreadable files, players and
  conflicts.

It reads its own minimal shape of the files rather than using
`packages/parse-tp`, whose match parser keeps no `level`. It changes no
player. See [Roster snapshot evidence](../import-manual/roster-snapshot-evidence.md)
for what the files show.

## Development

Its entrypoint runs on [cli-shared](../cli-shared/index.md)'s `runCli`
subcommand dispatcher, and it uses that package's shared helpers.

```bash
pnpm --filter @blood-bowl-tracker/production-ops-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/production-ops-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/production-ops-cli run verify      # build + lint + typecheck + format + test
```
