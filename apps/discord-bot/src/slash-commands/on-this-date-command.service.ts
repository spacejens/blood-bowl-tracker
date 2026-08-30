import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { ON_THIS_DATE_INVALID_DATE_MESSAGE } from '../error-messages';
import { OnThisDateFactsService } from '../insights/facts/on-this-date.service';
import { MonthDayService } from '../shared/month-day.service';
import type { ResolvedScope } from './insights-command.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

/**
 * The `/onthisdate` slash command: what happened on one calendar date across
 * every recorded year. The scope options, their autocomplete and their
 * not-found messages all come from `InsightsCommandService`'s shared seams,
 * so this command scopes identically to `/insights` by construction rather
 * than by convention. The rendering itself lives in `OnThisDateFactsService`,
 * which is also a fact-tree leaf (used by the random-insights scheduler).
 */
@Injectable()
export class OnThisDateCommandService implements OnModuleInit {
  constructor(
    private readonly facts: OnThisDateFactsService,
    private readonly monthDay: MonthDayService,
    private readonly insightsCommand: InsightsCommandService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'onthisdate',
      description:
        'Show what happened on one calendar date across every recorded year',
      options: [
        {
          name: 'date',
          description:
            'The calendar date as MM-DD, e.g. 02-29 (defaults to today)',
          type: ApplicationCommandOptionType.String,
        },
        ...this.insightsCommand.buildScopeOptions(),
      ],
      execute: (interaction) => this.execute(interaction),
      autocomplete: (interaction) => this.autocomplete(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const dateOption = interaction.options.getString('date');
    // An unparseable value is rejected rather than silently treated as
    // today, because a coach who named a date deserves to know their input
    // was not understood.
    const monthDay =
      dateOption === null
        ? this.monthDay.today()
        : this.monthDay.parse(dateOption);
    const scopeResult =
      monthDay === null
        ? null
        : await this.insightsCommand.resolveScopeOptions(interaction);
    return monthDay === null || scopeResult === null
      ? ON_THIS_DATE_INVALID_DATE_MESSAGE
      : this.replyFor(monthDay, scopeResult);
  }

  private async replyFor(
    monthDay: { month: number; day: number },
    scopeResult:
      | { kind: 'ok'; resolved: ResolvedScope }
      | { kind: 'error'; message: string },
  ): Promise<string | InteractionReplyOptions> {
    if (scopeResult.kind === 'error') {
      return scopeResult.message;
    }
    const reply = await this.facts.resolve({
      monthDay,
      scope: this.insightsCommand.toFactScope(scopeResult.resolved),
    });
    return this.insightsCommand.applyScopeSuffix(reply, scopeResult.resolved);
  }

  // Only the scope options autocomplete: `date` is free text, since a
  // month/day value has 366 possibilities, well past Discord's 25-choice
  // cap, and typing it is faster than scrolling it.
  async autocomplete(
    interaction: AutocompleteInteraction,
  ): Promise<{ name: string; value: string }[]> {
    return (
      (await this.insightsCommand.autocompleteScopeOption(interaction)) ?? []
    );
  }
}
