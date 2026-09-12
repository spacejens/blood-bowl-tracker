import type { InteractionKind } from '@blood-bowl-tracker/db';
import type { TopUserRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { DEBUG_TOP_USERS_NO_RESULTS_MESSAGE } from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';

/**
 * How many users one leaderboard lists. A fixed cap rather than an option,
 * matching `MAX_DEBUG_INTERACTIONS`: twenty short rows stay far inside
 * Discord's 4096-character embed description limit, and pagination is
 * deliberately left for a later iteration.
 */
export const MAX_DEBUG_TOP_USERS = 20;

/** The embed's title; the ranked rows themselves are its description. */
const DEBUG_TOP_USERS_TITLE = 'Top bot users';

/**
 * The `/debugtopusers` slash command: the Discord users who triggered the
 * most recorded bot interactions, most active first, optionally narrowed to
 * one interaction kind and/or a recent window - so effort spent on the bot's
 * features and reliability can be weighed against real usage, and so the
 * most active users are known when planning changes that might affect them.
 *
 * `debug`-prefixed per #834; that prefix is a visibility convention, not
 * access control. The reply is ephemeral, like its `/debuginteractions`
 * sibling: which specific users are most active is not public-channel
 * content.
 *
 * Global, with no guild-scoping option, for the same reason
 * `/debuginteractions` has none: a maintainer wants overall usage across
 * every guild and DM the bot has handled.
 *
 * The rows are formatted here rather than in a dedicated formatter service:
 * unlike a `/debuginteractions` row there is no parameter resolution and no
 * multi-field layout to justify the separation.
 */
@Injectable()
export class DebugTopUsersCommandService implements OnModuleInit {
  constructor(
    private readonly events: InteractionEventsQueryService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'debugtopusers',
      description: 'Debug: List the most active bot users',
      options: [
        {
          name: 'kind',
          description: 'Only interactions of this kind (optional)',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'Command', value: 'command' },
            { name: 'Button click', value: 'button' },
            { name: 'Select menu', value: 'select_menu' },
          ],
        },
        {
          name: 'days',
          description:
            'Only interactions from the last this many days (optional)',
          type: ApplicationCommandOptionType.Integer,
          minValue: 1,
        },
      ],
      execute: (interaction) => this.execute(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const rows = await this.events.topUsers({
      kind: this.kindOption(interaction),
      sinceDays: interaction.options.getInteger('days') ?? undefined,
      limit: MAX_DEBUG_TOP_USERS,
    });
    if (rows.length === 0) {
      return {
        content: DEBUG_TOP_USERS_NO_RESULTS_MESSAGE,
        flags: MessageFlags.Ephemeral,
      };
    }
    return {
      embeds: [
        {
          title: DEBUG_TOP_USERS_TITLE,
          description: this.enforceDescriptionLimit(this.describe(rows)),
        },
      ],
      flags: MessageFlags.Ephemeral,
    };
  }

  /** One ranked line per user, in the order the query returned them. */
  private describe(rows: TopUserRow[]): string {
    return rows
      .map((row, index) => {
        const noun =
          row.interactionCount === 1 ? 'interaction' : 'interactions';
        return `${index + 1}. **${row.username}** — ${row.interactionCount} ${noun}`;
      })
      .join('\n');
  }

  /**
   * Discord only ever returns one of the three declared choices, so the cast
   * is safe; `undefined` rather than `null` is what the query service reads
   * as "every kind".
   */
  private kindOption(
    interaction: ChatInputCommandInteraction,
  ): InteractionKind | undefined {
    return (
      (interaction.options.getString('kind') as InteractionKind | null) ??
      undefined
    );
  }

  /**
   * Defense in depth for Discord's embed description limit, mirroring
   * `DebugInteractionsCommandService.enforceDescriptionLimit` verbatim in
   * shape. Twenty rows of a Discord username (capped at 32 characters) never
   * come close to the 4096-character limit in practice, unlike that sibling
   * command's unbounded error messages and parameter values - this is a
   * cheap safety net rather than a case expected to trigger.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}
