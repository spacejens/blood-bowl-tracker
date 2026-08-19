import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  StringSelectMenuInteraction,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_MULTIPLE_TARGETS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';
import { DeepdiveTargetResolverService } from './deepdive-target-resolver.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

export {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../deepdive/button-custom-ids';

import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../deepdive/button-custom-ids';

@Injectable()
export class DeepdiveCommandService implements OnModuleInit {
  constructor(
    private readonly autocompleteService: DeepdiveAutocompleteService,
    private readonly discordClient: DiscordClientService,
    private readonly registry: SlashCommandRegistryService,
    private readonly targetResolver: DeepdiveTargetResolverService,
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
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleStarPlayerButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      RACE_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleRaceButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleCompetitionButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleTrophyButton(interaction),
    );
    this.discordClient.registerButtonHandler(
      COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleCompetitionGroupButton(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      ERA_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleEraSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      COACH_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleCoachSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      TEAM_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleTeamSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handlePlayerSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleStarPlayerSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      RACE_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleRaceSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleCompetitionSelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleTrophySelect(interaction),
    );
    this.discordClient.registerSelectMenuHandler(
      COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
      (interaction: StringSelectMenuInteraction) =>
        this.handleCompetitionGroupSelect(interaction),
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
          name: 'star-player',
          description:
            'Show the detail view for a single star player (optional)',
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
        {
          name: 'trophy',
          description: 'Show the detail view for a single trophy (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'competition-group',
          description:
            'Show the detail view for a single competition group (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
      ],
      execute: (interaction) => this.execute(interaction),
      autocomplete: (interaction) =>
        this.autocompleteService.resolve(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const eraOption = interaction.options.getString('era');
    const coachOption = interaction.options.getString('coach');
    const teamOption = interaction.options.getString('team');
    const playerOption = interaction.options.getString('player');
    const starPlayerOption = interaction.options.getString('star-player');
    const raceOption = interaction.options.getString('race');
    const competitionOption = interaction.options.getString('competition');
    const trophyOption = interaction.options.getString('trophy');
    const competitionGroupOption =
      interaction.options.getString('competition-group');
    const supplied = [
      eraOption,
      coachOption,
      teamOption,
      playerOption,
      starPlayerOption,
      raceOption,
      competitionOption,
      trophyOption,
      competitionGroupOption,
    ].filter((value) => value !== null);
    if (supplied.length > 1) {
      return DEEPDIVE_MULTIPLE_TARGETS_MESSAGE;
    }
    if (eraOption !== null) {
      return this.targetResolver.resolveEra(eraOption);
    }
    if (coachOption !== null) {
      return this.targetResolver.resolveCoach(coachOption);
    }
    if (teamOption !== null) {
      return this.targetResolver.resolveTeam(teamOption);
    }
    if (playerOption !== null) {
      return this.targetResolver.resolvePlayer(playerOption);
    }
    if (starPlayerOption !== null) {
      return this.targetResolver.resolveStarPlayer(starPlayerOption);
    }
    if (raceOption !== null) {
      return this.targetResolver.resolveRace(raceOption);
    }
    if (competitionOption !== null) {
      return this.targetResolver.resolveCompetition(competitionOption);
    }
    if (trophyOption !== null) {
      return this.targetResolver.resolveTrophy(trophyOption);
    }
    if (competitionGroupOption !== null) {
      return this.targetResolver.resolveCompetitionGroup(
        competitionGroupOption,
      );
    }
    return DEEPDIVE_USAGE_MESSAGE;
  }

  async handleEraButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      ERA_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveEra(idPart);
  }

  async handleCoachButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      COACH_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveCoach(idPart);
  }

  async handleTeamButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      TEAM_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveTeam(idPart);
  }

  async handlePlayerButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      PLAYER_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolvePlayer(idPart);
  }

  async handleStarPlayerButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveStarPlayer(idPart);
  }

  async handleRaceButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      RACE_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveRace(idPart);
  }

  async handleCompetitionButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      COMPETITION_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveCompetition(idPart);
  }

  async handleTrophyButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveTrophy(idPart);
  }

  async handleCompetitionGroupButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.targetResolver.resolveCompetitionGroup(idPart);
  }

  async handleEraSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_ERA_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveEra(value);
  }

  async handleCoachSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_COACH_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveCoach(value);
  }

  async handleTeamSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_TEAM_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveTeam(value);
  }

  async handlePlayerSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolvePlayer(value);
  }

  async handleStarPlayerSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveStarPlayer(value);
  }

  async handleRaceSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_RACE_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveRace(value);
  }

  async handleCompetitionSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveCompetition(value);
  }

  async handleTrophySelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveTrophy(value);
  }

  async handleCompetitionGroupSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const [value] = interaction.values;
    if (value === undefined) {
      return DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE;
    }
    return this.targetResolver.resolveCompetitionGroup(value);
  }
}
