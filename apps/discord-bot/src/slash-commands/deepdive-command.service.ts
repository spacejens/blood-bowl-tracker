import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import {
  CoachesService,
  CompetitionsService,
  ErasService,
} from '@blood-bowl-tracker/game-data';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { resolveCoachDeepdive } from '../deepdive/facts/coach-deepdive';
import { resolveEraDeepdive } from '../deepdive/facts/era-deepdive';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import { SlashCommandRegistryService } from './slash-command-registry.service';

const MAX_AUTOCOMPLETE_CHOICES = 25;

/** Prefix for era deepdive button customIds: `deepdive:era:<id>`. */
export const ERA_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:era:';

/** Prefix for coach deepdive button customIds: `deepdive:coach:<id>`. */
export const COACH_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:coach:';

@Injectable()
export class DeepdiveCommandService implements OnModuleInit {
  constructor(
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly coaches: CoachesService,
    private readonly discordClient: DiscordClientService,
    private readonly registry: SlashCommandRegistryService,
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
      ],
      execute: (interaction) => this.execute(interaction),
      autocomplete: (interaction) => this.autocomplete(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const eraOption = interaction.options.getString('era');
    if (eraOption !== null) {
      return this.resolveEra(eraOption);
    }
    const coachOption = interaction.options.getString('coach');
    if (coachOption !== null) {
      return this.resolveCoach(coachOption);
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
    return resolveEraDeepdive(id, {
      eras: this.eras,
      competitions: this.competitions,
    });
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
    return resolveCoachDeepdive(id, { coaches: this.coaches });
  }
}
