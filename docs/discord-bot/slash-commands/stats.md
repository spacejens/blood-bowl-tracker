# `/stats`

`/stats` reports the raw counts of the core tracked data. When invoked, the bot
replies in the same channel with a one-line summary:

> There have been N coaches and N teams. A total of N matches have been played in N competitions (N seasons, N cups)

Each N is a live count from the database — coaches, teams, matches, and
competitions (broken down into seasons and cups). The bot posts the same
summary automatically when it starts up.
