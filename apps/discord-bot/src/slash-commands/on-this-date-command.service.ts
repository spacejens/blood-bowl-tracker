import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX } from '../deepdive/button-custom-ids';
import { ON_THIS_DATE_INVALID_DATE_MESSAGE } from '../error-messages';
import { OnThisDateFactsService } from '../insights/facts/on-this-date.service';
import { DateButtonIdService } from '../shared/date-button-id.service';
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
 *
 * This service also owns the date drill-down buttons the date toplists post,
 * because it already holds everything answering one needs; both entry points
 * end in the same `replyFor`, so they cannot render differently.
 */
@Injectable()
export class OnThisDateCommandService implements OnModuleInit {
  constructor(
    private readonly facts: OnThisDateFactsService,
    private readonly monthDay: MonthDayService,
    private readonly insightsCommand: InsightsCommandService,
    private readonly registry: SlashCommandRegistryService,
    private readonly discordClient: DiscordClientService,
    private readonly buttonId: DateButtonIdService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
    this.discordClient.registerButtonHandler(
      ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX,
      (interaction) => this.handleDateButton(interaction),
    );
    // No matching registerSelectMenuHandler: date toplists cap at
    // MAX_LEADERBOARD_ENTRIES (10) rows, well under the 25-entry threshold
    // EntityComponentsService switches to select menus at, so this prefix can
    // never actually reach one.
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

  /**
   * A date drill-down button from one of the date toplists. The customId
   * carries the date and, when the toplist was scoped, that scope, so the
   * reply is narrowed exactly the way the toplist the button came from was.
   */
  async handleDateButton(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const idPart = interaction.customId.slice(
      ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX.length,
    );
    const decoded = this.buttonId.decode(idPart);
    // Defensive: Discord only ever returns an id DateButtonIdService itself
    // produced, so this path should be unreachable in practice.
    if (decoded === null) {
      return ON_THIS_DATE_INVALID_DATE_MESSAGE;
    }
    const scopeResult = await this.insightsCommand.resolveScopeById(
      decoded.scopeToken,
    );
    return this.replyFor(decoded.monthDay, scopeResult);
  }

  /**
   * The one reply path both `/onthisdate` and its drill-down buttons take, so
   * the two entry points can never render differently.
   */
  async replyFor(
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
