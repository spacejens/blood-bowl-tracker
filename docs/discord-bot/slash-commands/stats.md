# `/stats`

`/stats` reports the raw counts of the core tracked data. When invoked, the bot
replies in the same channel with a one-line summary:

> There have been N coaches and N teams. A total of N matches have been played in N competitions (N seasons, N cups)

Each N is a live count from the database — coaches, teams, matches, and
competitions (broken down into seasons and cups). The bot posts the same
summary automatically when it starts up.

The command is registered with every Discord server (guild) the bot belongs to
when it starts. A server the bot joins later receives the command the next time
the bot restarts.
