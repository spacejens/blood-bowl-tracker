import type { CommandInvocationRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import { Injectable } from '@nestjs/common';

import { SlashCommandRegistryService } from '../slash-command-registry.service';

/** What window to report on; omitting `sinceDays` reports all-time. */
export interface FilterUsageReportOptions {
  sinceDays?: number;
}

/** A user who has supplied at least one optional option. */
export interface FilterUsingUser {
  username: string;
}

/**
 * A user who has only ever invoked filterable commands plain.
 * `eligibleCount` is how many such invocations they made - the size of the
 * missed opportunity, and what the report ranks them by.
 */
export interface PlainOnlyUser {
  username: string;
  eligibleCount: number;
}

export interface FilterUsageReport {
  usesFilters: FilterUsingUser[];
  plainOnly: PlainOnlyUser[];
}

/** One user's running tally while invocations are being folded together. */
interface UserTally {
  username: string;
  eligibleCount: number;
  usedFilter: boolean;
}

/**
 * Splits the recorded Discord users into those who have supplied an optional
 * ("filter") slash-command option at least once and those who have only ever
 * invoked commands plain - a training/awareness signal, so users who may not
 * know the bot can narrow its output can be pointed at that capability.
 *
 * What counts as a filter is derived from the *live* command registration
 * rather than a hardcoded option list: an option is a filter candidate exactly
 * when its registration does not declare it `required`. A new optional option
 * on any command is therefore picked up with no change here.
 *
 * A command with no optional options at all (or one nothing registers any
 * more) offers no filter to discover, so its invocations are skipped entirely
 * - a user who only ever used such commands has no awareness gap to flag and
 * does not appear in the report.
 *
 * This classification lives in `apps/discord-bot` rather than in
 * `packages/discord-bot-usage`, which reads the raw recorded rows: that
 * package has no knowledge of live command registration, and must not gain
 * any.
 */
@Injectable()
export class FilterUsageReportService {
  constructor(
    private readonly events: InteractionEventsQueryService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  async report(options: FilterUsageReportOptions): Promise<FilterUsageReport> {
    const optionalOptions = this.optionalOptionsByCommand();
    const invocations = await this.events.commandInvocations({
      sinceDays: options.sinceDays,
    });
    const tallies = [...this.tally(invocations, optionalOptions).values()];
    return {
      usesFilters: tallies
        .filter((tally) => tally.usedFilter)
        .map((tally) => ({ username: tally.username }))
        .sort((left, right) => left.username.localeCompare(right.username)),
      plainOnly: tallies
        .filter((tally) => !tally.usedFilter)
        .map((tally) => ({
          username: tally.username,
          eligibleCount: tally.eligibleCount,
        }))
        .sort(
          (left, right) =>
            right.eligibleCount - left.eligibleCount ||
            left.username.localeCompare(right.username),
        ),
    };
  }

  /**
   * Folds the invocations into one tally per Discord user, keyed by the stable
   * Discord id rather than the username (which a user can change). The first
   * username seen for an id is the one reported.
   */
  private tally(
    invocations: CommandInvocationRow[],
    optionalOptions: Map<string, Set<string>>,
  ): Map<string, UserTally> {
    const tallies = new Map<string, UserTally>();
    for (const invocation of invocations) {
      const eligible = optionalOptions.get(invocation.commandName);
      if (eligible === undefined || eligible.size === 0) {
        continue;
      }
      const tally = tallies.get(invocation.discordUserId) ?? {
        username: invocation.username,
        eligibleCount: 0,
        usedFilter: false,
      };
      tally.eligibleCount += 1;
      tally.usedFilter ||= invocation.parameterKeys.some((key) =>
        eligible.has(key),
      );
      tallies.set(invocation.discordUserId, tally);
    }
    return tallies;
  }

  /**
   * Each registered command's optional option names. A command with no options
   * maps to an empty set, which `tally` treats the same as an unregistered
   * command: nothing to discover, so nothing to report.
   *
   * `required` is read through a cast because `ApplicationCommandOptionData` is
   * a union in which only some members declare the property; a member without
   * it is optional by Discord's own default, which is exactly what `!== true`
   * expresses.
   */
  private optionalOptionsByCommand(): Map<string, Set<string>> {
    return new Map(
      this.registry
        .all()
        .map((command) => [
          command.name,
          new Set(
            (command.options ?? [])
              .filter(
                (option) =>
                  (option as { required?: boolean }).required !== true,
              )
              .map((option) => option.name),
          ),
        ]),
    );
  }
}
