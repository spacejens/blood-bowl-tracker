import {
  CoachesQueriesService,
  CompetitionGroupsQueriesService,
  CompetitionsQueriesService,
  ErasQueriesService,
  LeaguesQueriesService,
  PlayersQueriesService,
  PositionsQueriesService,
  RacesQueriesService,
  StarPlayersService,
  TeamsQueriesService,
  TrophiesQueriesService,
} from '@blood-bowl-tracker/game-data-queries';
import { Injectable } from '@nestjs/common';
import type { AutocompleteInteraction } from 'discord.js';

import type { AutocompleteChoice } from './autocomplete-choice-label.service';
import { AutocompleteChoiceLabelService } from './autocomplete-choice-label.service';

/** Discord shows at most 25 autocomplete choices. */
const MAX_AUTOCOMPLETE_CHOICES = 25;

/**
 * Turns what a coach has typed into `/deepdive`'s autocomplete choices, one
 * branch per option. Kept separate from `DeepdiveCommandService` so that file
 * stays under the repo's 500-line ceiling: this half depends only on the entity
 * search services, the other half only on the deepdive fact resolvers.
 *
 * Every choice's `value` is the entity id as a string, because that is what
 * the command's resolvers parse back out.
 *
 * Team, player, coach, era and competition labels need context beyond the
 * search row and are built by `AutocompleteChoiceLabelService`; the remaining
 * options label from the search row alone.
 */
@Injectable()
export class DeepdiveAutocompleteService {
  constructor(
    private readonly erasQueries: ErasQueriesService,
    private readonly competitionsQueries: CompetitionsQueriesService,
    private readonly competitionGroupsQueries: CompetitionGroupsQueriesService,
    private readonly coachesQueries: CoachesQueriesService,
    private readonly teamsQueries: TeamsQueriesService,
    private readonly playersQueries: PlayersQueriesService,
    private readonly positionsQueries: PositionsQueriesService,
    private readonly racesQueries: RacesQueriesService,
    private readonly stars: StarPlayersService,
    private readonly trophiesQueries: TrophiesQueriesService,
    private readonly leaguesQueries: LeaguesQueriesService,
    private readonly choiceLabels: AutocompleteChoiceLabelService,
  ) {}

  async resolve(
    interaction: AutocompleteInteraction,
  ): Promise<AutocompleteChoice[]> {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'era') {
      const eras = await this.erasQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return this.choiceLabels.datedScopeChoices(eras);
    }
    if (focused.name === 'coach') {
      const coaches = await this.coachesQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return this.choiceLabels.coachChoices(coaches);
    }
    if (focused.name === 'team') {
      const teams = await this.teamsQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return this.choiceLabels.teamChoices(teams);
    }
    if (focused.name === 'player') {
      const players = await this.playersQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return this.choiceLabels.playerChoices(players);
    }
    if (focused.name === 'star-player') {
      // Cannot reuse the `player` branch: `PlayersQueriesService.searchByNamePrefix`
      // deliberately excludes stars, and a star's autocomplete value is its
      // `positions.id`, not a `players.id`. No team name in the label — a star
      // has no single team, which is the whole point of this target.
      const stars = await this.stars.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return stars.map((row) => ({
        name: row.name,
        value: String(row.positionId),
      }));
    }
    if (focused.name === 'position') {
      // Labelled with the race because position names repeat across races —
      // nearly every race has a "Lineman" — so a bare name would not say
      // which roster a suggestion means. A position available to several
      // races yields one suggestion per race, all carrying the same position
      // id as their value: the position deepdive shows every race the
      // position belongs to, so which of them was picked does not matter.
      const positions = await this.positionsQueries.searchByNamePrefixWithRace(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return positions.map((row) => ({
        name: `${row.name} (${row.raceName})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'race') {
      const races = await this.racesQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return races.map((row) => ({
        name: row.name,
        value: String(row.id),
      }));
    }
    if (focused.name === 'competition') {
      const competitions = await this.competitionsQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return this.choiceLabels.datedScopeChoices(competitions);
    }
    if (focused.name === 'competition-group') {
      const competitionGroups =
        await this.competitionGroupsQueries.searchByNamePrefix(
          focused.value,
          MAX_AUTOCOMPLETE_CHOICES,
        );
      return competitionGroups.map((row) => ({
        name: `${row.name} (${row.leagueName})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'trophy') {
      const trophies = await this.trophiesQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return trophies.map((row) => ({
        name: `${row.name} (${row.competitionGroupId !== null ? row.competitionGroupName : row.leagueName})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'league') {
      const leagues = await this.leaguesQueries.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return leagues.map((row) => ({
        name: row.name,
        value: String(row.id),
      }));
    }
    return [];
  }
}
