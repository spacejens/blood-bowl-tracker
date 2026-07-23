import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import {
  CoachesService,
  CompetitionsService,
  ErasService,
  PlayersService,
  RacesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_MULTIPLE_TARGETS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import { SlashCommandRegistryService } from './slash-command-registry.service';

export {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../deepdive/button-custom-ids';

import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../deepdive/button-custom-ids';

const MAX_AUTOCOMPLETE_CHOICES = 25;

@Injectable()
export class DeepdiveCommandService implements OnModuleInit {
  constructor(
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly coaches: CoachesService,
    private readonly teams: TeamsService,
    private readonly players: PlayersService,
    private readonly races: RacesService,
    private readonly discordClient: DiscordClientService,
    private readonly registry: SlashCommandRegistryService,
    private readonly eraDeepdive: EraDeepdiveService,
    private readonly coachDeepdive: CoachDeepdiveService,
    private readonly teamDeepdive: TeamDeepdiveService,
    private readonly playerDeepdive: PlayerDeepdiveService,
    private readonly raceDeepdive: RaceDeepdiveService,
    private readonly competitionDeepdive: CompetitionDeepdiveService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
    this.discordClient.registerButtonHandler(
      ERA_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleEraButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      COACH_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleCoachButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      TEAM_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleTeamButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handlePlayerButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      RACE_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleRaceButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleCompetitionButton(interaction),
    );
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'deepdive',
      description: 'Dig into the details of a recorded subject',
      options: [
        {
          name: 'era',
          description: 'Show the detail view for a single era (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'coach',
          description: 'Show the detail view for a single coach (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'team',
          description: 'Show the detail view for a single team (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'player',
          description: 'Show the detail view for a single player (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'race',
          description: 'Show the detail view for a single race (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'competition',
          description:
            'Show the detail view for a single competition (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
      ],
      execute: (interaction) => this.execute(interaction),
      autocomplete: (interaction) => this.autocomplete(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const eraOption = interaction.options.getString('era');
    const coachOption = interaction.options.getString('coach');
    const teamOption = interaction.options.getString('team');
    const playerOption = interaction.options.getString('player');
    const raceOption = interaction.options.getString('race');
    const competitionOption = interaction.options.getString('competition');
    const supplied = [
      eraOption,
      coachOption,
      teamOption,
      playerOption,
      raceOption,
      competitionOption,
    ].filter((value) => value !== null);
    if (supplied.length > 1) {
      return DEEPDIVE_MULTIPLE_TARGETS_MESSAGE;
    }
    if (eraOption !== null) {
      return this.resolveEra(eraOption);
    }
    if (coachOption !== null) {
      return this.resolveCoach(coachOption);
    }
    if (teamOption !== null) {
      return this.resolveTeam(teamOption);
    }
    if (playerOption !== null) {
      return this.resolvePlayer(playerOption);
    }
    if (raceOption !== null) {
      return this.resolveRace(raceOption);
    }
    if (competitionOption !== null) {
      return this.resolveCompetition(competitionOption);
    }
    return DEEPDIVE_USAGE_MESSAGE;
  }

  async handleEraButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      ERA_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolveEra(idPart);
  }

  async handleCoachButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      COACH_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolveCoach(idPart);
  }

  async handleTeamButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      TEAM_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolveTeam(idPart);
  }

  async handlePlayerButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      PLAYER_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolvePlayer(idPart);
  }

  async handleRaceButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      RACE_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolveRace(idPart);
  }

  async handleCompetitionButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      COMPETITION_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolveCompetition(idPart);
  }

  async autocomplete(
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

  /**
   * Parses an era id (from a slash option or a button customId) and renders
   * the deepdive. A non-integer value is rejected up front with the not-found
   * message, before any database lookup, since an unguarded `NaN` would reach
   * `eras.findByIdWithLeague` and make Postgres reject the query.
   */
  private resolveEra(value: string): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    }
    return this.eraDeepdive.resolve(id);
  }

  /**
   * Parses a coach id (from a slash option or a button customId) and renders
   * the deepdive. Non-integer values are rejected up front with the not-found
   * message, mirroring `resolveEra`.
   */
  private resolveCoach(
    value: string,
  ): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
    }
    return this.coachDeepdive.resolve(id);
  }

  /**
   * Parses a team id (from a slash option or a button customId) and renders
   * the deepdive. Non-integer values are rejected up front with the not-found
   * message, mirroring `resolveEra`/`resolveCoach`.
   */
  private resolveTeam(
    value: string,
  ): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
    }
    return this.teamDeepdive.resolve(id);
  }

  /**
   * Parses a player id (from a slash option or a button customId) and renders
   * the deepdive. Non-integer values are rejected up front with the not-found
   * message, mirroring `resolveEra`/`resolveCoach`/`resolveTeam`.
   */
  private resolvePlayer(
    value: string,
  ): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    }
    return this.playerDeepdive.resolve(id);
  }

  /**
   * Parses a race id (from a slash option or a button customId) and renders the
   * deepdive. Non-integer values are rejected up front with the not-found
   * message, mirroring `resolveEra`/`resolveCoach`/`resolveTeam`/`resolvePlayer`.
   */
  private resolveRace(
    value: string,
  ): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    }
    return this.raceDeepdive.resolve(id);
  }

  /**
   * Parses a competition id (from a slash option or a button customId) and
   * renders the deepdive. Non-integer values are rejected up front with the
   * not-found message, mirroring the other resolvers.
   */
  private resolveCompetition(
    value: string,
  ): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
    }
    return this.competitionDeepdive.resolve(id);
  }
}
