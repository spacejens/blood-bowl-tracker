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

import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  LEAGUE_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../../deepdive/button-custom-ids';

/** Resolves one entity id to that entity's display name, if it still exists. */
type NameLookup = (id: number) => Promise<string | undefined>;

/** The recorded parameter key that holds an entity id, per interaction kind. */
const ENTITY_ID_PARAMETER_KEY = {
  button: 'id',
  select_menu: 'value',
} as const;

/**
 * Turns a recorded slash-command option value, or a recorded button/select-
 * menu entity id, back into something a human can read. Every autocomplete-
 * backed option in this bot records the entity's database id as its value
 * (the autocomplete `value` is `String(row.id)`), and every drill-down
 * button/select-menu customId's dynamic remainder is likewise an entity id,
 * so `/debuginteractions` would otherwise show `race: 17` or
 * `button deepdive:coach: (id: 42)` where the coach picked `Orc`/`zog`.
 *
 * Resolution is deliberately best-effort: an unmapped option name or customId
 * prefix (a plain `category`, `date` or `outcome`, a select menu's own `id`
 * parameter, or a non-entity prefix like `debug:retrigger:`/`onthisdate:`), a
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
  private readonly componentLookups: Map<string, NameLookup>;

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
    const raceLookup: NameLookup = async (id) =>
      (await this.races.findById(id))?.name;
    const eraLookup: NameLookup = async (id) =>
      (await this.eras.findById(id))?.name;
    const leagueLookup: NameLookup = async (id) =>
      (await this.leagues.findById(id))?.name;
    const competitionLookup: NameLookup = async (id) =>
      (await this.competitions.findById(id))?.name;
    const competitionGroupLookup: NameLookup = async (id) =>
      (await this.competitionGroups.findByIdWithLeague(id))?.name;
    const coachLookup: NameLookup = async (id) =>
      (await this.coaches.findById(id))?.name;
    const teamLookup: NameLookup = async (id) =>
      (await this.teams.findById(id))?.name;
    const playerLookup: NameLookup = async (id) =>
      (await this.players.findById(id))?.name;
    const starPlayerLookup: NameLookup = async (id) =>
      (await this.starPlayers.findById(id))?.name;
    const positionLookup: NameLookup = async (id) =>
      (await this.positions.findById(id))?.name;
    const trophyLookup: NameLookup = async (id) =>
      (await this.trophies.findById(id))?.name;

    this.lookups = new Map<string, NameLookup>([
      ['race', raceLookup],
      ['era', eraLookup],
      ['league', leagueLookup],
      ['competition', competitionLookup],
      ['competition-group', competitionGroupLookup],
      ['coach', coachLookup],
      ['team', teamLookup],
      ['player', playerLookup],
      ['star-player', starPlayerLookup],
      ['position', positionLookup],
      ['trophy', trophyLookup],
    ]);

    // The same eleven entity types every drill-down button/select-menu
    // routes to, keyed by customId prefix instead of option name. A prefix
    // with no entity behind it (debug:retrigger:, onthisdate:) is left
    // unmapped on purpose.
    this.componentLookups = new Map<string, NameLookup>([
      [RACE_BUTTON_CUSTOM_ID_PREFIX, raceLookup],
      [ERA_BUTTON_CUSTOM_ID_PREFIX, eraLookup],
      [LEAGUE_BUTTON_CUSTOM_ID_PREFIX, leagueLookup],
      [COMPETITION_BUTTON_CUSTOM_ID_PREFIX, competitionLookup],
      [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX, competitionGroupLookup],
      [COACH_BUTTON_CUSTOM_ID_PREFIX, coachLookup],
      [TEAM_BUTTON_CUSTOM_ID_PREFIX, teamLookup],
      [PLAYER_BUTTON_CUSTOM_ID_PREFIX, playerLookup],
      [STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX, starPlayerLookup],
      [POSITION_BUTTON_CUSTOM_ID_PREFIX, positionLookup],
      [TROPHY_BUTTON_CUSTOM_ID_PREFIX, trophyLookup],
    ]);
  }

  async resolve(key: string, rawValue: string): Promise<string> {
    return this.resolveViaLookup(this.lookups.get(key), rawValue);
  }

  private async resolveViaLookup(
    lookup: NameLookup | undefined,
    rawValue: string,
  ): Promise<string> {
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

  /**
   * Every parameter of one recorded button or select-menu interaction,
   * resolved in parallel. Unlike a command's parameters (looked up by option
   * name), a component's entity type comes from its customId `prefix` — the
   * `id`/`value` parameter keys are generic and reused across every prefix.
   * A button's `id` parameter IS the entity id; a select menu's `id`
   * parameter is its own menu index (`menu:0`), never an entity, so only its
   * `value` parameters (the selected entity ids) are resolved.
   */
  resolveComponentParameters(
    prefix: string,
    kind: 'button' | 'select_menu',
    parameters: InteractionEventParameterRow[],
  ): Promise<InteractionEventParameterRow[]> {
    const entityIdKey = ENTITY_ID_PARAMETER_KEY[kind];
    const lookup = this.componentLookups.get(prefix);
    return Promise.all(
      parameters.map(async (parameter) => ({
        key: parameter.key,
        value:
          parameter.value === null || parameter.key !== entityIdKey
            ? parameter.value
            : await this.resolveViaLookup(lookup, parameter.value),
      })),
    );
  }
}
