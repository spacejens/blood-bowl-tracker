import type { InteractionOutcome } from '@blood-bowl-tracker/db';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';

import { DEBUG_INTERACTIONS_NO_RESULTS_MESSAGE } from '../error-messages';
import { DebugInteractionRowFormatterService } from './debug-interaction-row-formatter.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

/**
 * How many interactions one reply lists. A fixed cap rather than an option:
 * 20 rows stay comfortably inside Discord's 4096-character embed description
 * limit even when every row carries parameters, and pagination is
 * deliberately left for a later iteration.
 */
export const MAX_DEBUG_INTERACTIONS = 20;

/** The embed's title; the rows themselves are its description. */
const DEBUG_INTERACTIONS_TITLE = 'Recent interactions';

/**
 * The `/debuginteractions` slash command: the most recent recorded bot
 * interactions, newest first, optionally narrowed to one Discord user and/or
 * one outcome - maintainer tooling for answering "it failed for me" without
 * direct database access.
 *
 * `debug`-prefixed per #834; that prefix is a visibility convention, not
 * access control. The reply is ephemeral - the only ephemeral reply in the
 * bot - because it can surface another user's interaction history and
 * internal error messages, neither of which belongs in a public channel.
 *
 * Global, with no guild-scoping option: `interaction_events.guild_id` is
 * nullable (a DM belongs to no guild), and someone diagnosing a report wants
 * the user's full recent history wherever it happened.
 */
@Injectable()
export class DebugInteractionsCommandService implements OnModuleInit {
  constructor(
    private readonly events: InteractionEventsQueryService,
    private readonly formatter: DebugInteractionRowFormatterService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'debuginteractions',
      description: 'Debug: List recent bot interactions',
      options: [
        {
          name: 'user',
          description: 'Only interactions by this Discord user (optional)',
          type: ApplicationCommandOptionType.User,
        },
        {
          name: 'outcome',
          description: 'Only interactions with this outcome (optional)',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'Success', value: 'success' },
            { name: 'Failure', value: 'failure' },
          ],
        },
      ],
      execute: (interaction) => this.execute(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const rows = await this.events.listRecent({
      discordUserId: interaction.options.getUser('user')?.id,
      outcome: this.outcomeOption(interaction),
      limit: MAX_DEBUG_INTERACTIONS,
    });
    if (rows.length === 0) {
      return {
        content: DEBUG_INTERACTIONS_NO_RESULTS_MESSAGE,
        flags: MessageFlags.Ephemeral,
      };
    }
    return {
      embeds: [
        {
          title: DEBUG_INTERACTIONS_TITLE,
          description: this.formatter.describe(rows),
        },
      ],
      flags: MessageFlags.Ephemeral,
    };
  }

  /**
   * Discord only ever returns one of the two declared choices, so the cast is
   * safe; `undefined` rather than `null` is what the query service reads as
   * "unfiltered".
   */
  private outcomeOption(
    interaction: ChatInputCommandInteraction,
  ): InteractionOutcome | undefined {
    return (
      (interaction.options.getString('outcome') as InteractionOutcome | null) ??
      undefined
    );
  }
}
