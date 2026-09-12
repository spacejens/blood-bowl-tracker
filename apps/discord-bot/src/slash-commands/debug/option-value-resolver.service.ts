import type { InteractionEventParameterRow } from '@blood-bowl-tracker/discord-bot-usage';
import {
  CoachesService,
  CompetitionGroupsService,
  CompetitionsService,
  ErasService,
  LeaguesService,
  PlayersService,
  PositionsService,
  RacesService,
  StarPlayersService,
  TeamsService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/** Resolves one entity id to that entity's display name, if it still exists. */
type NameLookup = (id: number) => Promise<string | undefined>;

/**
 * Turns a recorded slash-command option value back into something a human can
 * read. Every autocomplete-backed option in this bot records the entity's
 * database id as its value (the autocomplete `value` is `String(row.id)`), so
 * `/debuginteractions` would otherwise show `race: 17` where the coach picked
 * `Orc`.
 *
 * Resolution is deliberately best-effort: an unmapped option name (a plain
 * `category`, `date` or `outcome`, or a component's `id`/`value` parameter), a
 * value that is not an integer id, or an entity deleted since the interaction
 * was recorded all fall back to the raw recorded value. Nothing here may break
 * the listing over stale data.
 *
 * Does real I/O through `packages/game-data`, so specs of its consumers must
 * always mock it — it is not covered by CLAUDE.md's pure-formatting carve-out.
 */
@Injectable()
export class OptionValueResolverService {
  private readonly lookups: Map<string, NameLookup>;

  constructor(
    private readonly races: RacesService,
    private readonly eras: ErasService,
    private readonly leagues: LeaguesService,
    private readonly competitions: CompetitionsService,
    private readonly competitionGroups: CompetitionGroupsService,
    private readonly coaches: CoachesService,
    private readonly teams: TeamsService,
    private readonly players: PlayersService,
    private readonly starPlayers: StarPlayersService,
    private readonly positions: PositionsService,
    private readonly trophies: TrophiesService,
  ) {
    this.lookups = new Map<string, NameLookup>([
      ['race', async (id) => (await this.races.findById(id))?.name],
      ['era', async (id) => (await this.eras.findById(id))?.name],
      ['league', async (id) => (await this.leagues.findById(id))?.name],
      [
        'competition',
        async (id) => (await this.competitions.findById(id))?.name,
      ],
      [
        'competition-group',
        async (id) =>
          (await this.competitionGroups.findByIdWithLeague(id))?.name,
      ],
      ['coach', async (id) => (await this.coaches.findById(id))?.name],
      ['team', async (id) => (await this.teams.findById(id))?.name],
      ['player', async (id) => (await this.players.findById(id))?.name],
      [
        'star-player',
        async (id) => (await this.starPlayers.findById(id))?.name,
      ],
      ['position', async (id) => (await this.positions.findById(id))?.name],
      ['trophy', async (id) => (await this.trophies.findById(id))?.name],
    ]);
  }

  async resolve(key: string, rawValue: string): Promise<string> {
    const lookup = this.lookups.get(key);
    if (lookup === undefined) {
      return rawValue;
    }
    const id = Number(rawValue);
    if (!Number.isInteger(id)) {
      return rawValue;
    }
    try {
      return (await lookup(id)) ?? rawValue;
    } catch {
      return rawValue;
    }
  }

  /**
   * Every parameter of one recorded interaction, resolved in parallel. A
   * `null` value (recorded for an option supplied with no value) stays
   * `null`, so the formatter still renders its `<empty>` placeholder.
   *
   * No batching or deduplication: at most twenty rows of a handful of
   * parameters each, each one a primary-key lookup.
   */
  resolveParameters(
    parameters: InteractionEventParameterRow[],
  ): Promise<InteractionEventParameterRow[]> {
    return Promise.all(
      parameters.map(async (parameter) => ({
        key: parameter.key,
        value:
          parameter.value === null
            ? null
            : await this.resolve(parameter.key, parameter.value),
      })),
    );
  }
}
