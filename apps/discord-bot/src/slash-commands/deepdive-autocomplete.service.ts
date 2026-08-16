import {
  CoachesService,
  CompetitionsService,
  ErasService,
  PlayersService,
  RacesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { AutocompleteInteraction } from 'discord.js';

/** Discord shows at most 25 autocomplete choices. */
const MAX_AUTOCOMPLETE_CHOICES = 25;

/**
 * Turns what a coach has typed into `/deepdive`'s autocomplete choices, one
 * branch per option. Split out of `DeepdiveCommandService` so that file stays
 * under the repo's 500-line ceiling: this half depends only on the entity
 * search services, the other half only on the deepdive fact resolvers.
 *
 * Every choice's `value` is the entity id as a string, because that is what
 * the command's resolvers parse back out.
 */
@Injectable()
export class DeepdiveAutocompleteService {
  constructor(
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly coaches: CoachesService,
    private readonly teams: TeamsService,
    private readonly players: PlayersService,
    private readonly races: RacesService,
  ) {}

  async resolve(
    interaction: AutocompleteInteraction,
  ): Promise<{ name: string; value: string }[]> {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'era') {
      const eras = await this.eras.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return eras.map((row) => ({
        name: `${row.name} (${row.leagueName})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'coach') {
      const coaches = await this.coaches.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return coaches.map((row) => ({
        name: `${row.name} (#${row.id})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'team') {
      const teams = await this.teams.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return teams.map((row) => ({
        name: `${row.name} (#${row.id})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'player') {
      const players = await this.players.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return players.map((row) => ({
        name: `${row.name} (${row.teamName})`,
        value: String(row.id),
      }));
    }
    if (focused.name === 'race') {
      const races = await this.races.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return races.map((row) => ({
        name: row.name,
        value: String(row.id),
      }));
    }
    if (focused.name === 'competition') {
      const competitions = await this.competitions.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return competitions.map((row) => ({
        name: `${row.name} (${row.leagueName})`,
        value: String(row.id),
      }));
    }
    return [];
  }
}
