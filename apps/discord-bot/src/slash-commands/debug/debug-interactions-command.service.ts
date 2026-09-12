import type { InteractionOutcome } from '@blood-bowl-tracker/db';
import type { InteractionEventRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { DEBUG_INTERACTIONS_NO_RESULTS_MESSAGE } from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { DebugInteractionRowFormatterService } from './debug-interaction-row-formatter.service';
import { DebugRetriggerButtonsService } from './debug-retrigger-buttons.service';
import { OptionValueResolverService } from './option-value-resolver.service';

/**
 * How many interactions one reply lists. A fixed cap rather than an option:
 * 20 rows stay comfortably inside Discord's 4096-character embed description
 * limit in the common case, and pagination is deliberately left for a later
 * iteration. `error_message` and parameter values are unbounded text, so
 * `enforceDescriptionLimit` below still truncates as an absolute safety net.
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
    private readonly optionValues: OptionValueResolverService,
    private readonly retriggerButtons: DebugRetriggerButtonsService,
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
    const decorated = await this.decorate(rows);
    return {
      embeds: [
        {
          title: DEBUG_INTERACTIONS_TITLE,
          description: this.enforceDescriptionLimit(
            this.formatter.describe(decorated),
          ),
        },
      ],
      // If enforceDescriptionLimit truncated the rendered text, a retrigger
      // button can exist for a row whose numbered line is no longer visible
      // in the embed. This is deliberately left as-is: it requires very long
      // parameter values to trigger, and slicing the button list to match
      // the truncated text would add real complexity for a rare case.
      components: this.retriggerButtons.build(rows.map((row) => row.id)),
      flags: MessageFlags.Ephemeral,
    };
  }

  /**
   * Each row with its recorded parameter values swapped for resolved entity
   * names where one could be found. Done here rather than in the formatter so
   * the formatter stays pure and dependency-free — it renders whatever values
   * it is handed. A command's parameters are resolved by option name; a
   * button/select-menu's entity type instead comes from its customId
   * `name`/prefix, so those two kinds go through a different resolver method.
   */
  private decorate(
    rows: InteractionEventRow[],
  ): Promise<InteractionEventRow[]> {
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        parameters:
          row.kind === 'command'
            ? await this.optionValues.resolveParameters(row.parameters)
            : await this.optionValues.resolveComponentParameters(
                row.name,
                row.kind,
                row.parameters,
              ),
      })),
    );
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

  /**
   * Absolute safety net for Discord's embed description limit.
   * `interaction_events.error_message` and recorded parameter values are
   * unbounded text, so twenty rows of failures with long error messages can
   * still overflow the character cap despite the fixed row limit. Mirrors
   * `StarPlayerDeepdiveService.enforceDescriptionLimit` verbatim in shape.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}
