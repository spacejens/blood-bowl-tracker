# `/insights`

`/insights` shares a fact drawn from a growing tree of categorized
[insights](../../glossary.md#insight) derived from the recorded game data. When
invoked, the bot replies in the same channel — most facts reply with an embedded
leaderboard.

## Argument

The command takes one optional string argument, `category`, a dotted path into
the [fact tree](../../glossary.md#fact-tree) (for example `coach.toplist.teams`):

- **No argument** — the bot picks a random fact from the whole tree.
- **A specific fact path** (e.g. `coach.toplist.matches.played`) — the bot
  returns that fact.
- **A branch path** (e.g. `coach.toplist`) — the bot picks a random fact from
  under that branch.
- **A path that matches nothing** — the bot replies with a not-found message.

As you type the argument, autocomplete suggests the next segment of valid paths
so you can navigate the tree without memorizing it.

## Scope options

Besides `category`, the command takes four optional scope options — `league`,
`era`, `competition` and `match-category`, in that drill-down order. They are
mutually exclusive: supplying more than one replies with a conflict message.
With none of them, facts are all-time and the embed title ends in
`— All time`; with one, the title ends in that league, era, competition or
match category's name instead. An era or competition is dated as well as
named — `— BB2020 (2020-01-01 – present)` — so a reader can tell whether the
scope is finished or still running; a league and a match category have no date
range of their own and appear as bare names.

`league`, `era` and `competition` autocomplete against the recorded data. An
era or competition suggestion names its league and date span —
`BB2020 (Premier League, 2020-01-01 – present)` — the same label `/deepdive`
uses, so same-named eras or competitions can be told apart; a league
suggestion is its bare name.
`match-category` instead offers every match category as a fixed choice, so
there is no id to mistype and no "not found" reply.

Each fact declares which of the four scopes it supports; a fact that does not
support the scope in play is skipped, and asking for it by name replies with a
per-scope refusal message. Exact per-fact scope support is declared on each
fact in `apps/discord-bot/src/insights/fact-tree.ts`. Facts whose values are
not derived from matches or match events (counts of teams, rostered players,
skills, eras, trophies, competition groups, star player hires) cannot take a
match category. Facts that count competitions played, or that total match-event
points per player, can, because those values do come from matches (see below).
`stats` is excluded deliberately: only two of the counts it reports have a
category at all, so a category-scoped `stats` would mix scoped and all-time
numbers.

Note that `coach.toplist.competitions.played` and
`team.toplist.competitions.played` change meaning under a match category: they
then count the competitions in which that coach or team actually played a
match of the chosen category (e.g. with Season Final, the seasons whose final
they reached), rather than every competition entered.

## Available facts

The exact event and consequence kinds these facts count live in the database
schema rather than here — see `packages/db/src/schema/game-data/match-events.ts`
(`actionTypeEnum` and `consequenceTypeEnum`) for the authoritative list.

The facts are listed by the part of the fact tree they belong to:

- [Coach facts](insights-facts-coach.md) — `coach.toplist.*`
- [Team facts](insights-facts-team.md) — `team.toplist.*`
- [Player facts](insights-facts-player.md) — `player.toplist.*`
- [Other facts](insights-facts-other.md) — `stats`, and the race, position,
  skill, star player, era, trophy, competition group and date facts

The bot's startup message carries only the deployment embed; it does not
post a fact from this tree.

Leaderboards show the top five ranks; ties share a rank, so a leaderboard can
list more than five entries. If the database does not respond in time, the
command falls back to a themed timeout message.
