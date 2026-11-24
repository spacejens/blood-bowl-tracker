# import-manual-planner-cli

`tools/import-manual-planner-cli` is a NestJS CLI application that plans
[import-manual](../import-manual/index.md) batches filling in the data of
incomplete TP players, and collects the evidence those plans rest on. It
reads production read-only, the TP feed channel's history and the TP
downloads, and changes no data itself: `tools/import-manual` applies the
batch files it writes like any other batch (see
[Filling in missing players](../import-manual/filling-missing-players.md#generated-fills)).

## Subcommands

| Subcommand | Purpose |
| --- | --- |
| `generate-incomplete-player-fills` | Plan the manual-import fills of incomplete TP players whose data can be proven, read-only from production, optionally with the TP feed evidence `read-tp-feed-history` saved (`--feed-channel=<channel-id>`) and the roster snapshot evidence `read-tp-roster-snapshots` saved (`--snapshots`); prints the batch file and a report, or writes the file with `--out=<repo-relative-path>` |
| `read-tp-feed-history` | Read a TP feed channel's whole history and save its advancement reports as local evidence; `--max-pages=N` stops after N pages of 100 |
| `read-tp-roster-snapshots` | Read every downloaded TP match and roster file and save what each shows of every player, as evidence for `generate-incomplete-player-fills --snapshots` |

## Running it

```bash
pnpm build
node tools/import-manual-planner-cli/dist/main.js <subcommand>
```

Run from the repo root. On success, every subcommand prints JSON on stdout; failures print a JSON error on stderr and exit with status 1. `generate-incomplete-player-fills` (for the database URL) and `read-tp-feed-history` (for the bot token) require `apps/discord-bot/.env.production` to be present in the checkout they run in, synced from the main checkout (see [deploy-production/SKILL.md](../../.claude/skills/deploy-production/SKILL.md)); they read it through `packages/cli-shared`'s `ProductionEnvFileService`, which never prints a value. `read-tp-feed-history` calls Discord through cli-shared's `DiscordRestService`, the same client [production-ops-cli](../production-ops-cli/index.md#running-it)'s Discord subcommands use.

The evidence the two collectors save lives in the gitignored `tools/import-manual-planner-cli/data/`. Evidence saved in the main checkout's `tools/production-ops-cli/data/` is not moved by any command: move its `tp-feed-<channel-id>/` and `tp-roster-snapshots/` directories into `tools/import-manual-planner-cli/data/` by hand, or run `read-tp-feed-history` and `read-tp-roster-snapshots` again.

## Generating incomplete-player fills

`generate-incomplete-player-fills` runs read-only queries through
`packages/cli-shared`'s `RunProductionQueryService`, the same guarded `psql`
runner as production-ops-cli's `run-production-query`, one per kind of
row. The query runner has a `tuplesOnly` mode for this: it passes `psql` its tuples-only
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
`report.lastingInjuryRepairsNothingToRecord` the ones left out.
`ScratchCompletenessService` then leaves out every repair a database built
from scratch would refuse because it has the player incomplete. It judges
that from the snapshots' `rosterCopies` and the players they show at all,
the TP ids earlier batches under `tools/import-manual/data/batches` fill,
and this run's fills. A player no downloaded file shows is kept, since a
scratch build never creates him, but only when the snapshots' `unreadable`
is empty: a file that could not be read may show him, so while any is
listed he is left out.
`report.lastingInjuryRepairsScratchIncomplete` gives their count and TP ids
(see
[Recording lasting reductions](../import-manual/filling-missing-players.md#recording-lasting-reductions)).
`section` holds the batch file when no `--out` is given. With `--out`, the
file is written through cli-shared's `WriteFileService` and `written`
reports it. A run with `--out`, no eligible player and no repair writes
nothing and fails, with the report in the error message so the skipped
players and their reasons are still visible.

`--feed-channel=<channel-id>` reads
`tools/import-manual-planner-cli/data/tp-feed-<channel-id>/reports.json`, the
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
`tools/import-manual-planner-cli/data/tp-roster-snapshots/snapshots.json`, the
evidence `read-tp-roster-snapshots` saves (see
[Reading the TP roster snapshots](#reading-the-tp-roster-snapshots)),
before any query runs. A missing or malformed file stops the run. Repairs
need it: a run that selects a repair without the flag stops with an error
once the queries have run. Without the flag, players at or above the
cheapest advancement whom the feed does not name stay `spp-too-high`; with
it and without `--feed-channel`, every such player goes to the snapshot
stage, which also needs his stored unspent SPP to equal the snapshot's.
With both flags, a player the feed names whose reports do not add up to the
SPP he spent also goes to the snapshot stage, with his reports fixed in
place; `report.eligibleByStage.feedWithSnapshot` counts those fills. The
evidence file's age is not checked, so run `read-tp-roster-snapshots` again
after downloading. The queries also read every skill's and every candidate
position's `tourplay.net` ids, and the skills held with a variant anywhere.
`report.eligibleByStage.snapshot` counts the snapshot fills. See
[Generated fills](../import-manual/filling-missing-players.md#generated-fills).

## Reading the TP feed history

```bash
node tools/import-manual-planner-cli/dist/main.js read-tp-feed-history <channel-id> [--max-pages=N]
```

This reads the TP feed channel (the bot's `TP_FEED_SOURCE_DISCORD_CHANNEL_ID`,
see [TP notification feed](../discord-bot/tp-feed-setup.md#configuration)) and keeps its
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
gitignored `tools/import-manual-planner-cli/data/tp-feed-<channel-id>/`:

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
`sync-gitignored` never replaces something already present, so a real
`tools/import-manual-planner-cli/data` directory in a worktree is left
unlinked, and what it holds is removed with the worktree. Move its contents
into the main checkout's `tools/import-manual-planner-cli/data/`, remove the
emptied worktree directory, and only then run `sync-gitignored`, or run the
collectors again in the main checkout.

## Reading the TP roster snapshots

```bash
node tools/import-manual-planner-cli/dist/main.js read-tp-roster-snapshots
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
  `tools/import-manual-planner-cli/data/tp-roster-snapshots/`, regenerated on every
  run. `players` maps a TP player id to each distinct state with its source
  files. `conflicts` lists the players shown in more than one state.
  `unreadable` lists the files of another shape, with the reason. Neither
  stops the run. `rosterCopies` lists, per era directory and roster id, the
  copies the TP import sends and which players they list (see [Roster
  copies the import sends](../import-manual/roster-snapshot-evidence.md#roster-copies-the-import-sends)).
  A file saved before `rosterCopies` existed is refused; run the collector
  again.
- **Summary.** Match and roster files read, unreadable files, players,
  conflicts, roster copy groups (`rosterCopies`) and the groups whose sent
  copy could not be determined (`rosterCopiesUndetermined`).

It reads the player states with its own minimal shape of the files rather
than using `packages/parse-tp`, whose match parser keeps no `level`. It
reads the roster copies with parse-tp's `RosterParserService`, as the TP
import does. It changes no player. See [Roster snapshot evidence](../import-manual/roster-snapshot-evidence.md)
for what the files show.

## Dependency rules

It is a client-side tool. It reaches production only through
`packages/cli-shared`'s `RunProductionQueryService` and Discord only through
cli-shared's `DiscordRestService`, the services `tools/production-ops-cli`
uses too, so neither tool depends on the other. It writes batch files that
`tools/import-manual` applies, but does not depend on that package.

The package depends on `@blood-bowl-tracker/domain-enums` for the status,
characteristic-format, skill, advancement-kind and match-event enums, and
on `@blood-bowl-tracker/parse-tp`, whose `RosterParserService` reads each
roster copy the way the TP import does, so a copy the import drops is
unreadable here too. `@blood-bowl-tracker/db` and
`@blood-bowl-tracker/game-data` are dev dependencies, used only by
drift-guard specs. Four drift-guard specs keep the tool in step with the
code it mirrors. One keeps the SQL selection in step with
`INCOMPLETE_PLAYER_CRITERIA`. Another runs the generator's advancement
pricing next to game-data's own order check
(`AdvancementOrderDeductionService`) and requires the server to accept
exactly the spend the generator prices. The third runs the repair
selector's reduction counts next to game-data's
`PlayerFillReductionsService` and requires both to agree. The fourth reads
roster copies next to parse-tp's `RosterParserService` and requires the
same finish instant and players, or an unreadable copy where parse-tp
rejects the file.

## Development

Its entrypoint runs on [cli-shared](../cli-shared/index.md)'s `runCli`
subcommand dispatcher, and it uses that package's shared helpers.

```bash
pnpm --filter @blood-bowl-tracker/import-manual-planner-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/import-manual-planner-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/import-manual-planner-cli run verify      # build + lint + typecheck + format + test
```
