# `/deepdive`

`/deepdive` is a lookup and drill-down command for a single recorded subject.
Today it supports three targets — an era, a coach, and a team — and is
designed to grow further optional, mutually exclusive targets (players, and so
on) in future work.

## Arguments

The command takes three optional string arguments, `era`, `coach`, and `team`,
each autocompleted by name (`era` suggestions are labelled `<era>
(<league>)`):

- **No argument** — the bot replies with a short usage prompt, because a
  deepdive needs a target. This is framed as "specify a target", not a hard
  validation error, so the command can add targets later without changing this
  contract.
- **More than one argument** (e.g. both `era` and `coach`) — the bot rejects
  the call with an error message instead of guessing which target was
  intended, since the arguments are mutually exclusive.
- **`era:<era>`** — the bot replies with an embed for that era: the era name as
  the title, then its league, its start–end dates (an ongoing era shows
  `present`), its rules sets (comma-joined, or "None recorded"), and a
  chronological list of the era's competitions, one line per competition
  formatted `<name> (<type>)`. Competitions are ordered by their earliest
  recorded match; competitions with no played matches yet sort last. An era
  with no competitions shows a short "nothing played yet" message instead of a
  list.
- **An era that matches nothing** — the bot replies with a not-found message.
- **`coach:<coach>`** — the bot replies with an embed for that coach: the coach
  name as the title, then their career span (the first and last dates across
  every match they have played), a blank line, and `Top teams by matches
  played:` followed by their top five teams by matches played, one line per
  team formatted `<rank>. <team> — <matches>`. Ties at the fifth-place cutoff
  are all shown, up to ten teams — the same convention `/insights` toplists
  use, though at most ten teams are fetched for a deepdive, so the toplists'
  "…and N more tied." truncation note never actually appears here. A coach who
  exists but has recorded no matches shows a short "hasn't played yet" message
  instead of a career span and team list.
- **A coach that matches nothing** — the bot replies with a not-found message.
- **`team:<team>`** — the bot replies with an embed for that team: the team
  name as the title, then its race, its coach, its career span (the first and
  last dates across every match it has played), a blank line, and `Top players
  by match events:` followed by its top five players by total match events —
  every recorded event a player took part in, of any type, counted together —
  one line per player formatted `<rank>. <player> — <events>`. Ties at the
  fifth-place cutoff are all shown, up to ten players (the same convention
  `/insights` toplists use, though at most ten players are fetched, so the
  "…and N more tied." note never actually appears here). A team that exists but
  has recorded no matches shows a short "hasn't played yet" message in place of
  the career span and player list, but still shows its race and coach.
- **A team that matches nothing** — the bot replies with a not-found message.

If the database does not respond in time, the command falls back to a themed
timeout message instead of its normal reply, so it always answers within
Discord's response window.

## Relationship to `/insights`

`/insights`' `eras.list` view lists every era and attaches one button per era.
Pressing a button opens the same era deepdive shown by `/deepdive era:<era>` —
the button and the command share a single resolver, so their output is always
identical. Likewise, each of the four coach toplists
(`coach.toplist.matches.played`, `coach.toplist.teams`,
`coach.toplist.competitions.played`, `coach.toplist.eras.active`) attaches one
button per listed coach, opening the same `/deepdive coach:<coach>` view. See
[`/insights`](insights.md).

Each of the sixteen `team.toplist.*` facts (all the team toplists except
`race.toplist.teams`, whose rows key by race) attaches one button per listed
team, opening the same `/deepdive team:<team>` view.

This is the intended pattern going forward: as `/deepdive` grows more lookup
targets, most `/insights` views that list items of a supported target type are
expected to gain a button per listed item, opening that item's deepdive the
same way `eras.list`, the coach toplists, and the team toplists do today.

See the implementation in `apps/discord-bot/src/slash-commands/deepdive-command.service.ts`
and the resolvers in `apps/discord-bot/src/deepdive/facts/era-deepdive.ts`,
`apps/discord-bot/src/deepdive/facts/coach-deepdive.ts`, and
`apps/discord-bot/src/deepdive/facts/team-deepdive.ts`.
