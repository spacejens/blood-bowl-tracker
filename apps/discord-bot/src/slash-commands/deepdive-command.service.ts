import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import {
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

import { resolveEraDeepdive } from '../deepdive/facts/era-deepdive';
import { DEEPDIVE_USAGE_MESSAGE } from '../error-messages';
import { SlashCommandRegistryService } from './slash-command-registry.service';

const MAX_AUTOCOMPLETE_CHOICES = 25;

/** Prefix for era deepdive button customIds: `deepdive:era:<id>`. */
export const ERA_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:era:';

@Injectable()
export class DeepdiveCommandService implements OnModuleInit {
  constructor(
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly discordClient: DiscordClientService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
    this.discordClient.registerButtonHandler(
      ERA_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleEraButton(interaction),
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
      ],
      execute: (interaction) => this.execute(interaction),
      autocomplete: (interaction) => this.autocomplete(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const eraOption = interaction.options.getString('era');
    if (eraOption === null) {
      return DEEPDIVE_USAGE_MESSAGE;
    }
    return this.resolveEra(eraOption);
  }

  async handleEraButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      ERA_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    return this.resolveEra(idPart);
  }

  async autocomplete(
    interaction: AutocompleteInteraction,
  ): Promise<{ name: string; value: string }[]> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'era') {
      return [];
    }
    const eras = await this.eras.searchByNamePrefix(
      focused.value,
      MAX_AUTOCOMPLETE_CHOICES,
    );
    return eras.map((row) => ({
      name: `${row.name} (${row.leagueName})`,
      value: String(row.id),
    }));
  }

  /**
   * Parses an era id (from a slash option or a button customId) and renders
   * the deepdive. A non-integer or unknown id falls through to
   * `resolveEraDeepdive`'s not-found handling via a `NaN` lookup.
   */
  private resolveEra(value: string): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    return resolveEraDeepdive(id, {
      eras: this.eras,
      competitions: this.competitions,
    });
  }
}
