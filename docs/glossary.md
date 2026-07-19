# Glossary

Definitions of all named concepts used in this project. See [spec-conventions.md](spec-conventions.md) for how specs reference this glossary.

---

## Coach

The person who manages and controls a [team](#team), making decisions during [matches](#match) and between them (roster changes, treasury spending, etc.).

See [game-concepts/coaches](game-concepts/coaches/index.md).

## Casualty

A player who has been seriously injured or killed during a match, removing them from the current game and potentially affecting future matches.

## Competition

An organized event in which [teams](#team) compete against each other within a [league](#league). [Seasons](#season) and [cups](#cup) are the two subtypes of competition. A league consists of multiple competitions.

See [game-concepts/competitions](game-concepts/competitions/index.md).

## Cup

A subtype of [competition](#competition) — a short competitive event typically played out over a weekend, in which [teams](#team) compete for a trophy.

See [game-concepts/competitions](game-concepts/competitions/index.md).

## Deepdive

The `/deepdive` Discord command's detail view for a single recorded subject —
currently an [era](#era) or a [coach](#coach) (career span and top teams).
See [the command spec](discord-bot/slash-commands/deepdive.md).

## Drive

A period of play that begins with a kick-off and ends when a [touchdown](#touchdown) is scored or the current [half](#half) ends. Each [half](#half) may contain multiple drives.

## Era

A period of time during which a [league](#league) used one or more [rules sets](#rules-set), in sequence. A league may have multiple eras, and in some cases eras for different rules sets may overlap (e.g. when different groups within the league play under different rules simultaneously).

See [game-concepts/eras](game-concepts/eras/index.md).

## External System

An upstream application or data source (e.g. BBL) that [league](#league) data
can be imported from. Each [era](#era) references exactly one external
system.

See [game-concepts/external-systems](game-concepts/external-systems/index.md).

## Half

One of the two periods of a [match](#match). Each half consists of up to eight [turns](#turn) per team.

## Inducement

A temporary hire, piece of equipment, or other advantage that a team purchases before a [match](#match), typically using extra gold gained from a treasury or a lower team value than the opponent.

## League

An organized group of [teams](#team) that play [matches](#match) against each other over multiple [competitions](#competition). A league may be divided into [eras](#era) when the [rules set](#rules-set) changes.

See [game-concepts/leagues](game-concepts/leagues/index.md).

## Match

A single game of Blood Bowl played between two [teams](#team). Consists of two [halves](#half).

See [game-concepts/matches](game-concepts/matches/index.md).

## Match Event

A noteworthy occurrence during a [match](#match), such as a [touchdown](#touchdown) or [casualty](#casualty) being scored. Match events are the primary unit of data recorded during a game.

See [game-concepts/match-events](game-concepts/match-events/index.md).

## Player

An individual on a [team era](#team-era) (and, through it, a [team](#team)). Each player has a [race](#race)-specific [position](#position), a set of skills, and personal statistics that persist across [matches](#match) within that era.

See [game-concepts/players](game-concepts/players/index.md).

## Position

A player's designated role within their [team](#team), determined by their [race](#race) (e.g. Lineman, Blitzer, Thrower). Positions define base statistics and starting skills.

See [game-concepts/positions](game-concepts/positions/index.md).

## Race

The species or faction a [team](#team) belongs to (e.g. Humans, Orcs, Elves). Race determines which [positions](#position) are available on the [roster](#roster) and the team's overall play style. A race's availability is tracked per [era](#era).

See [game-concepts/races](game-concepts/races/index.md).

## Roster

The list of [players](#player) registered to a [team](#team)'s [team era](#team-era). Rosters persist between [matches](#match) within an era, and grow as players gain experience or are replaced, but reset to empty when a team enters a new era.

## Rules Set

A specific published edition or version of the Blood Bowl rules (e.g. Second Season Edition, Death Zone). The [rules set(s)](#rules-set) in use for a [league](#league) during a given period are captured by an [era](#era).

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

## Season

A subtype of [competition](#competition) — a complete round of play within a [league](#league), after which standings are resolved and a winner is determined.

See [game-concepts/competitions](game-concepts/competitions/index.md).

## Star Player Points (SPP)

Experience points earned by individual [players](#player) during [matches](#match) for scoring [touchdowns](#touchdown), completing passes, causing [casualties](#casualty), and similar achievements. Accumulated SPP allow a player to level up and gain new skills.

## Team Era

A [team](#team)'s membership within a single [era](#era). Owns everything that resets when a team is rebooted into a new era — its [roster](#roster) of [players](#player), and (in future) its treasury. A team may have at most one team era per era.

See [game-concepts/team-eras](game-concepts/team-eras/index.md).

## Team

A named group of [players](#player) belonging to a single [race](#race), managed by one [coach](#coach), whose identity (name, race, coach) persists across every [era](#era) it exists in. Each era a team enters is tracked separately as a [team era](#team-era), which owns that era's [roster](#roster) and other era-scoped state.

See [game-concepts/teams](game-concepts/teams/index.md).

## Touchdown

A score achieved by carrying the ball into the opponent's end zone. Ends the current [drive](#drive).

## Turn

A team's activation window within a [half](#half), during which each of their [players](#player) may perform one action. Each team has up to eight turns per [half](#half).

## Turnover

The premature end of a team's [turn](#turn), triggered by specific failed actions (e.g. a dropped ball, a failed block). Play passes immediately to the opposing team.
