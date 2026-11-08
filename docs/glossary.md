# Glossary

Definitions of all named concepts used in this project. See [spec-conventions.md](spec-conventions.md) for how specs reference this glossary.

Entries are split into two sections: terms a [coach](#coach) directly encounters when using the tracker or playing the game, and terms that only describe the project's own internals. Entries are roughly alphabetical within each section.

---

## User-facing terms

### Advancement

A permanent improvement a [player](#player) gains — a new [skill](#skill) or a characteristic increase — paid for with [SPP](#star-player-points-spp). Each [rules set](#rules-set) prices advancements in its own way; the tracker records the SPP cost of each successive advancement per rules set, and per kind of advancement where the rules set prices them by type, plus any extra advancements a league's house rules add for its players (see [Star Player Points storage](database/star-player-points.md#advancement-costs)).

### Advancement order

The position of an [advancement](#advancement) in the sequence a [player](#player) gained them, shared by gained skills and characteristic increases. It is unknown for some entries, and otherwise either a proxy taken from how a source lists them or confirmed as the real sequence; only a confirmed order affects what the advancements are priced at (see [skills](game-concepts/skills/index.md#player-skills)). A confirmed order can also be a source's own order trusted because every order that fits costs the same, so it is not always the proven sequence.

### Apothecary

Team staff who can be called upon during a [match](#match) to attempt to heal or reduce the severity of an injury that would otherwise be a [casualty](#casualty). See also [regeneration](#regeneration), a similar effect rolled on the [player](#player)'s own skill rather than provided by team staff.

### BB2016

The 2016 Blood Bowl [rules set](#rules-set). Like [CRP and CRP+](#crp-and-crp), it prices [advancements](#advancement) at fixed thresholds of 6, 16, 31, 51, 76 and 176 [SPP](#star-player-points-spp), each threshold reached earning a roll on the advancement table.

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

### BB2020

The 2020 Blood Bowl [rules set](#rules-set). It prices each [advancement](#advancement) by what the [coach](#coach) takes: a random or chosen primary skill, a random or chosen secondary skill, or a random characteristic increase.

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

### BB2025

The 2025 Blood Bowl [rules set](#rules-set). It prices each [advancement](#advancement) by what the [coach](#coach) takes, as [BB2020](#bb2020) does, but has no random secondary skill option. It also marks some skills as [elite](#elite-skill).

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

### BBL

Shorthand for Blood Bowl League, the league-tracker site at [bbleague.net](https://www.bbleague.net/) (also reachable as [bloodbowlleague.com](https://bloodbowlleague.com/)), and one of the two [external systems](#external-system) the tracker imports data from, the other being [TP](#tp). [tLoEG](#tloeg) and [GBBL](#gbbl) both kept their records on BBL; their subdomain is now defunct.

See [game-concepts/external-systems](game-concepts/external-systems/index.md).

### Coach

The person who manages and controls a [team](#team), making decisions during [matches](#match) and between them (roster changes, treasury spending, etc.).

See [game-concepts/coaches](game-concepts/coaches/index.md).

### Casualty

A player who has been seriously injured or killed during a match, removing them from the current game and potentially affecting future matches.

### Characteristic increase

An [advancement](#advancement) that raises one of a [player](#player)'s [characteristics](#characteristics) by one. Each increase is recorded individually, with its [advancement order](#advancement-order) where known.

### Characteristics

A [position](#position)'s or [player](#player)'s five stat values: MA, ST, AG, PA and AV. A position's characteristics are recorded per [rules set](#rules-set); a player's own values can move away from them through advancement or a [lasting injury](#lasting-injury).

See [game-concepts/players](game-concepts/players/index.md).

### Competition

An organized event in which [teams](#team) compete against each other within a [league](#league). [Seasons](#season) and [cups](#cup) are the two subtypes of competition. A league consists of multiple competitions.

See [game-concepts/competitions](game-concepts/competitions/index.md).

### Competition Group

The recurring track a [competition](#competition) instance belongs to — e.g. Major Season, Minor Season, Chaos Cup, or Ogretoberfest. Groups are curated data, not inferred from a source system: they are what distinguishes a Major season's 1st place from a Minor season's 1st place when both sources label them identically. Each group belongs to one [league](#league), and a [trophy](#trophy) scoped to a group (rather than directly to a league) records which group it is applicable for.

See [game-concepts/competitions](game-concepts/competitions/index.md).

### CRP and CRP+

CRP is the Competition Rules Pack [rules set](#rules-set). CRP+ follows it in [tLoEG](#tloeg)'s era sequence CRP → CRP+ → [BB2016](#bb2016). Both price [advancements](#advancement) at fixed thresholds of 6, 16, 31, 51, 76 and 176 [SPP](#star-player-points-spp), each threshold reached earning a roll on the advancement table.

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

### Cup

A subtype of [competition](#competition) — a short competitive event typically played out over a weekend, in which [teams](#team) compete for a trophy.

See [game-concepts/competitions](game-concepts/competitions/index.md).

### DB2021

The Dungeon Bowl 2021 [rules set](#rules-set). It prices each [advancement](#advancement) by what the [coach](#coach) takes, as [BB2020](#bb2020) does.

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

### Deepdive

The `/deepdive` Discord command's detail view for a single recorded subject,
such as an [era](#era), a [coach](#coach), or a [team](#team).
See [the command spec](discord-bot/slash-commands/deepdive.md).

### Drive

A period of play that begins with a kick-off and ends when a [touchdown](#touchdown) is scored or the current [half](#half) ends. Each [half](#half) may contain multiple drives.

### Elite skill

[BB2025](#bb2025)'s marker on a handful of [skills](#skill) (Block, Dodge, Guard and Mighty Blow) that cost more player value to pick than other skills. It is not a restriction on which skills can be picked.

See [Characteristics and skills storage](database/characteristics-and-skills.md#elite-skills).

### Era

A period of time during which a [league](#league) used one or more [rules sets](#rules-set), in sequence. A league may have multiple eras, and in some cases eras for different rules sets may overlap (e.g. when different groups within the league play under different rules simultaneously).

See [game-concepts/eras](game-concepts/eras/index.md).

### External System

An upstream application or data source (e.g. [BBL](#bbl)) that [league](#league) data
can be imported from. [Eras](#era), [coaches](#coach), [leagues](#league) and
[keywords](#keyword) can be linked to any number of external systems through
external ids.

See [game-concepts/external-systems](game-concepts/external-systems/index.md).

### Free extra skill

A gained [skill](#skill) a [player](#player) has without having spent [SPP](#star-player-points-spp) on it, and that is not one of their [advancements](#advancement): it costs nothing and does not raise the price of later advancements. [BB2025](#bb2025)'s Hatred, a skill [TP](#tp) flags as extra, and a skill a [trophy award](#trophy-award) grants are free extras.

See [game-concepts/skills](game-concepts/skills/index.md#player-skills).

### GBBL

"Gothenburg Blood Bowl League", one of the two real [leagues](#league) the tracker records, the other being [tLoEG](#tloeg).

See [game-concepts/leagues](game-concepts/leagues/index.md).

### Half

One of the two periods of a [match](#match). Each half consists of up to eight [turns](#turn) per team.

### Inducement

A temporary hire, piece of equipment, or other advantage that a team purchases before a [match](#match), typically using extra gold gained from a treasury or a lower team value than the opponent.

### Insight

A statistic, top list, or other piece of derived or human-submitted content about recorded game data, organized into the [fact tree](#fact-tree) that the `/insights` command draws from.

See [discord-bot/slash-commands/insights.md](discord-bot/slash-commands/insights.md).

### Journeyman

A temporary [player](#player) fielded by a [team](#team) that has too few available players for a [match](#match), rather than a permanent member of its [roster](#roster). Unlike a [mercenary](#mercenary), a journeyman is drawn from the team's own basic [positions](#position) rather than hired in.

### Keyword

A label attached to a [position](#position) — `Goblin`, `Undead`,
`Big Guy` — that rules single out instead of naming a [race](#race). A
position can carry several at once, recorded per [rules set](#rules-set).
Species keywords (`Goblin`, `Undead`) are [BB2025](#bb2025)-only; positional
keywords including `Big Guy` also appear under [DB2021](#db2021), and
`Big Guy` alone also appears under [BB2020](#bb2020).

See [game-concepts/keywords](game-concepts/keywords/index.md).

### Keyword kind

Whether a [keyword](#keyword) names a creature (`species`), a role
(`positional`), or is the `special` sentinel meaning "no restriction".

See [game-concepts/keywords](game-concepts/keywords/index.md).

### Lasting Injury

A [player](#player)'s current, outstanding injury state: whether they must miss their next [match](#match), how many niggling injuries they carry, and how many reductions each of their [characteristics](#characteristics) sits under. It is live state that newer [rules sets](#rules-set) allow to heal between [competitions](#competition), distinct from the history of injuries recorded as [match events](#match-event).

See [game-concepts/players](game-concepts/players/index.md).

### League

An organized group of [teams](#team) that play [matches](#match) against each other over multiple [competitions](#competition). A league may be divided into [eras](#era) when the [rules set](#rules-set) changes.

See [game-concepts/leagues](game-concepts/leagues/index.md).

### Match

A single game of Blood Bowl played between two [teams](#team) — rarely more, as in a merged final. Consists of two [halves](#half).

See [game-concepts/matches](game-concepts/matches/index.md).

### Match Category

Each [match](#match) has exactly one match category, describing its competitive stage within its [competition](#competition) — for example routine play versus a semi-final or a final. [Insights](#insight) and importers can scope or classify by match category.

See [game-concepts/matches](game-concepts/matches/index.md).

### Match Event

A noteworthy occurrence during a [match](#match), such as a [touchdown](#touchdown) or [casualty](#casualty) being scored. Match events are the primary unit of data recorded during a game.

See [game-concepts/match-events](game-concepts/match-events/index.md).

### Mercenary

A [player](#player) hired for a single [match](#match) only (e.g. a Big Guy), rather than a permanent member of a [team](#team)'s [roster](#roster). Unlike a [journeyman](#journeyman), a mercenary is an outside hire rather than drawn from the team's own [positions](#position).

### NAF

Nuffle Amorical Football ([thenaf.net](https://www.thenaf.net/)). A [coach](#coach)'s NAF number is stored as an [external ID](#external-id), under an [external system](#external-system) the tracker references but does not import data from.

See [game-concepts/external-systems](game-concepts/external-systems/index.md).

### Player

An individual on a [team era](#team-era) (and, through it, a [team](#team)). Each player has a [position](#position) (ordinarily [race](#race)-specific, but see [star player](#star-player) for the exception), a set of skills, personal statistics that persist across [matches](#match) within that era, and a current status (active, dead, retired or temporarily retired), which is unknown until a source reports it.

See [game-concepts/players](game-concepts/players/index.md).

### Position

A player's designated role within their [team](#team), ordinarily determined by their [race](#race) (e.g. Lineman, Blitzer, Thrower) — except a [star player](#star-player), which teams of several races may hire. Positions define base statistics and starting skills.

See [game-concepts/positions](game-concepts/positions/index.md).

### Race

The species or faction a [team](#team) belongs to (e.g. Humans, Orcs, Elves). Race determines which [positions](#position) are available on the [roster](#roster) and the team's overall play style. A race's availability is tracked per [era](#era).

See [game-concepts/races](game-concepts/races/index.md).

### Race Era

A [race](#race) within a specific [era](#era). [Positions](#position) are made available per race era rather than to a race directly, so availability can change from one era to the next.

See [game-concepts/positions](game-concepts/positions/index.md).

### Regeneration

A skill that gives a [player](#player) a chance to avoid what would otherwise be a [casualty](#casualty). See also [apothecary](#apothecary), a similar effect provided by team staff rather than by the player's own skill.

### Roster

The list of [players](#player) registered to a [team](#team)'s [team era](#team-era). Rosters persist between [matches](#match) within an era, and grow as players gain experience or are replaced, but reset to empty when a team enters a new era.

### Rules Set

A specific published edition or version of the Blood Bowl rules (e.g. Second Season Edition, Death Zone). The [rules set(s)](#rules-set) in use for a [league](#league) during a given period are captured by an [era](#era).

See [game-concepts/rules-sets](game-concepts/rules-sets/index.md).

### Season

A subtype of [competition](#competition) — a complete round of play within a [league](#league), after which standings are resolved and a winner is determined.

See [game-concepts/competitions](game-concepts/competitions/index.md).

### Skill

A named special ability a [player](#player) can have, such as Block or Dodge. A [position](#position) grants a set of starting skills to every player who holds it, and players can gain more as they accumulate [SPP](#star-player-points-spp). Every skill belongs to a [skill category](#skill-category) under each [rules set](#rules-set) that has it.

See [game-concepts/skills](game-concepts/skills/index.md).

### Skill Category

The group a [skill](#skill) belongs to — General, Agility, Passing, Strength, Mutation, Devious, Trait or Unique — the learnable ones being what an advancing [player](#player) rolls against to decide which skills they may take. A skill's category is recorded per [rules set](#rules-set), not globally, because a rules set can move a skill from one category to another. Trait is intrinsic rather than learnable, and Unique is the category for a [star player](#star-player)'s one skill exclusive to them under a rules set. Under each rules set, a [position](#position) has primary and secondary skill categories: the learnable categories its players may take skills from when they advance.

See [game-concepts/skills](game-concepts/skills/index.md).

### Star Player

A [position](#position) playable across several [races](#race), unlike an ordinary race-specific position. Hiring a star creates a new [player](#player) each time, rather than reusing or transferring one.

See [game-concepts/star-players](game-concepts/star-players/index.md).

### Star Player Points (SPP)

Experience points earned by individual [players](#player) during [matches](#match) for scoring [touchdowns](#touchdown), completing passes, causing [casualties](#casualty), and similar achievements. Accumulated SPP allow a player to level up and gain new skills. The tracker stores each award on the [match event](game-concepts/match-events/index.md) that earned it, so a player's total is a running sum rather than a live re-derivation; see [Star Player Points storage](database/star-player-points.md#award-values-and-precedence) for how the standardised award values and each source's own reported figures are reconciled.

### Team Era

A [team](#team)'s membership within a single [era](#era). Owns everything that resets when a team is rebooted into a new era — its [roster](#roster) of [players](#player), and (in future) its treasury. A team may have at most one team era per era.

See [game-concepts/team-eras](game-concepts/team-eras/index.md).

### Team

A named group of [players](#player) belonging to a single [race](#race), managed by one [coach](#coach), whose identity (name, race, coach) persists across every [era](#era) it exists in. Each era a team enters is tracked separately as a [team era](#team-era), which owns that era's [roster](#roster) and other era-scoped state.

See [game-concepts/teams](game-concepts/teams/index.md).

### tLoEG

"the League of Extraordinary Gentlenerds", one of the two real [leagues](#league) the tracker records, the other being [GBBL](#gbbl).

See [game-concepts/leagues](game-concepts/leagues/index.md).

### Touchdown

A score achieved by carrying the ball into the opponent's end zone. Ends the current [drive](#drive).

### TP

TourPlay ([tourplay.net](https://tourplay.net)), one of the two [external systems](#external-system) the tracker imports data from, the other being [BBL](#bbl).

See [game-concepts/external-systems](game-concepts/external-systems/index.md).

### Trophy

A curated, named award for a [team](#team) or an individual [player](#player), scoped to either one [competition group](#competition-group) or one [league](#league).

See [game-concepts/trophies](game-concepts/trophies/index.md).

### Trophy Award

One concrete instance of a [trophy](#trophy) being given out, in one [competition](#competition), to one recipient.

See [game-concepts/trophies](game-concepts/trophies/index.md#trophy-award).

### Turn

A team's activation window within a [half](#half), during which each of their [players](#player) may perform one action. Each team has up to eight turns per [half](#half).

### Turnover

The premature end of a team's [turn](#turn), triggered by specific failed actions (e.g. a dropped ball, a failed block). Play passes immediately to the opposing team.

### Unspent SPP

A [player](#player)'s total [SPP](#star-player-points-spp) minus the cost of the [advancements](#advancement) they have gained.

See [game-concepts/players](game-concepts/players/index.md#unspent-spp).

---

## Internal terms

### External ID

One of the identifiers a record can be known by within a given [external system](#external-system), used by an [upsert](#upsert) to match incoming data to existing records across import runs.

See [api/imports.md](api/imports.md).

### Fact Tree

The categorized tree of [insights](#insight) that the `/insights` command's `category` argument navigates as a dotted path (e.g. `coach.toplist.teams`).

See [discord-bot/slash-commands/insights.md](discord-bot/slash-commands/insights.md).

### Manual import batch

A numbered directory of `tools/import-manual`'s hand-curated data, applied to a database once, in number order (the first before the [BBL](#bbl) and [TP](#tp) importers, the rest after them), and then kept unchanged as a historical record. The database records which batches it holds, so a long-lived database receives only new batches.

See [import-manual/batches.md](import-manual/batches.md).

### Upsert

The operation importable entities expose to importers: given a candidate identity (see [external ID](#external-id)), the server finds a matching existing record and updates it, or creates a new record if none matches. An upsert overlays fields onto an existing record rather than replacing the whole record.

See [api/imports.md](api/imports.md).
