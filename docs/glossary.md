# Glossary

Definitions of all named concepts used in this project. See [spec-conventions.md](spec-conventions.md) for how specs reference this glossary.

---

## Coach

The person who manages and controls a [team](#team), making decisions during [matches](#match) and between them (roster changes, treasury spending, etc.).

## Casualty

A player who has been seriously injured or killed during a match, removing them from the current game and potentially affecting future matches.

## Cup

A short competitive event — typically played out over a weekend — in which [teams](#team) compete for a trophy. Similar to a [season](#season) but condensed in time. A [league](#league) may include multiple cups alongside its seasons.

## Drive

A period of play that begins with a kick-off and ends when a [touchdown](#touchdown) is scored or the current [half](#half) ends. Each [half](#half) may contain multiple drives.

## Era

A period of time during which a [league](#league) used a particular [rules set](#rules-set). A league may have multiple eras, and in some cases eras for different rules sets may overlap (e.g. when different groups within the league play under different rules simultaneously).

## Half

One of the two periods of a [match](#match). Each half consists of up to eight [turns](#turn) per team.

## Inducement

A temporary hire, piece of equipment, or other advantage that a team purchases before a [match](#match), typically using extra gold gained from a treasury or a lower team value than the opponent.

## League

An organized competition in which a group of [teams](#team) play [matches](#match) against each other, accumulating standings. A league spans multiple [seasons](#season) and [cups](#cup), and may be divided into [eras](#era) when the [rules set](#rules-set) changes.

## Match

A single game of Blood Bowl played between two [teams](#team). Consists of two [halves](#half).

## Match Event

A noteworthy occurrence during a [match](#match), such as a [touchdown](#touchdown) or [casualty](#casualty) being scored. Match events are the primary unit of data recorded during a game.

## Player

An individual on a [team](#team). Each player has a [race](#race)-specific [position](#position), a set of skills, and personal statistics that persist across [matches](#match).

## Position

A player's designated role within their [team](#team), determined by their [race](#race) (e.g. Lineman, Blitzer, Thrower). Positions define base statistics and starting skills.

## Race

The species or faction a [team](#team) belongs to (e.g. Humans, Orcs, Elves). Race determines which [positions](#position) are available on the [roster](#roster) and the team's overall play style.

## Roster

The list of [players](#player) registered to a [team](#team). In a [league](#league), rosters persist between [matches](#match) and grow as players gain experience or are replaced.

## Rules Set

A specific published edition or version of the Blood Bowl rules (e.g. Second Season Edition, Death Zone). The [rules set](#rules-set) in use for a [league](#league) during a given period is captured by an [era](#era).

## Season

A complete round of competition within a [league](#league), after which standings are resolved and a winner is determined.

## Star Player Points (SPP)

Experience points earned by individual [players](#player) during [matches](#match) for scoring [touchdowns](#touchdown), completing passes, causing [casualties](#casualty), and similar achievements. Accumulated SPP allow a player to level up and gain new skills.

## Team

A named group of [players](#player) belonging to a single [race](#race), managed by one [coach](#coach). Teams participate in [matches](#match) and, in a [league](#league), persist with their [roster](#roster) and treasury between [matches](#match).

## Touchdown

A score achieved by carrying the ball into the opponent's end zone. Ends the current [drive](#drive).

## Turn

A team's activation window within a [half](#half), during which each of their [players](#player) may perform one action. Each team has up to eight turns per [half](#half).

## Turnover

The premature end of a team's [turn](#turn), triggered by specific failed actions (e.g. a dropped ball, a failed block). Play passes immediately to the opposing team.
