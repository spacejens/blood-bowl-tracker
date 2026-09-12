import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { DEBUG_FILTER_USAGE_NO_RESULTS_MESSAGE } from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import type {
  FilterUsageReport,
  PlainOnlyUser,
} from './filter-usage-report.service';
import { FilterUsageReportService } from './filter-usage-report.service';

/** The embed's title; the two headed sections are its description. */
const DEBUG_FILTER_USAGE_TITLE = 'Filter usage';

/**
 * The `/debugfilterusage` slash command: which Discord users have ever
 * narrowed a command with an optional ("filter") option, and which have only
 * ever invoked commands plain - a training/awareness signal, so users who may
 * not know the bot can narrow its output can be pointed at that capability.
 *
 * It complements `/debugtopusers`, which reports *how much* a user interacts
 * with the bot, by reporting *how* they interact with it.
 *
 * `debug`-prefixed per #834; that prefix is a visibility convention, not
 * access control. The reply is ephemeral, like its `/debuginteractions` and
 * `/debugtopusers` siblings: which specific users do what is not
 * public-channel content.
 *
 * The plain-only section comes first because it is the actionable one, and
 * carries each user's invocation count so the ranking is visible; the
 * uses-filters section is a flat alphabetical list, since there is nothing to
 * rank there. An empty section is omitted rather than printed with no rows.
 *
 * Classification lives in `FilterUsageReportService`; this service only parses
 * the option and formats the reply.
 */
@Injectable()
export class DebugFilterUsageCommandService implements OnModuleInit {
  constructor(
    private readonly filterUsage: FilterUsageReportService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'debugfilterusage',
      description: 'Debug: Report who uses optional filters vs. plain commands',
      options: [
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
    const report = await this.filterUsage.report({
      sinceDays: interaction.options.getInteger('days') ?? undefined,
    });
    if (report.usesFilters.length === 0 && report.plainOnly.length === 0) {
      return {
        content: DEBUG_FILTER_USAGE_NO_RESULTS_MESSAGE,
        flags: MessageFlags.Ephemeral,
      };
    }
    return {
      embeds: [
        {
          title: DEBUG_FILTER_USAGE_TITLE,
          description: this.enforceDescriptionLimit(this.describe(report)),
        },
      ],
      flags: MessageFlags.Ephemeral,
    };
  }

  /**
   * The two headed sections, separated by a blank line, each section's rows in
   * the order the report returned them. A section with no rows is left out.
   */
  private describe(report: FilterUsageReport): string {
    const sections: string[] = [];
    if (report.plainOnly.length > 0) {
      sections.push(
        [
          '**Plain only**',
          ...report.plainOnly.map((user) => this.plainOnlyRow(user)),
        ].join('\n'),
      );
    }
    if (report.usesFilters.length > 0) {
      sections.push(
        [
          '**Uses filters**',
          ...report.usesFilters.map((user) => `- ${user.username}`),
        ].join('\n'),
      );
    }
    return sections.join('\n\n');
  }

  private plainOnlyRow(user: PlainOnlyUser): string {
    const noun = user.eligibleCount === 1 ? 'invocation' : 'invocations';
    return `- ${user.username} — ${user.eligibleCount} ${noun}`;
  }

  /**
   * Defense in depth for Discord's embed description limit, mirroring
   * `DebugTopUsersCommandService.enforceDescriptionLimit` verbatim in shape -
   * copied rather than shared, matching that service's own note about small
   * verbatim duplication over a premature shared helper.
   *
   * Neither list is capped, so unlike that sibling this is a limit a busy
   * install could genuinely reach. A hard truncation is still the answer, with
   * pagination deliberately left for a later iteration.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}
