import type { DateMatchCount, FactScope } from '@blood-bowl-tracker/game-data';
import { DateToplistService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  DATE_TOPLIST_NO_DATA_MESSAGE,
  DATE_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DateButtonIdService } from '../../shared/date-button-id.service';
import { MonthDayService } from '../../shared/month-day.service';
import { LeaderboardService } from '../leaderboard.service';

/** A ranked date row, carrying its raw month/day alongside the rendered name. */
interface DateToplistRow extends DateMatchCount {
  name: string;
}

/**
 * The `date.toplist.matches.*` facts: calendar dates ranked by how many
 * matches were played on them across every recorded year.
 *
 * Hand-written against `LeaderboardService.resolveToplist` rather than built
 * by `ToplistFactoryService`, for two reasons the factory cannot express: the
 * query rows are `{month, day, count}` rather than a ready `{name, count}`,
 * and the `EntityLink` is per-call because it closes over the current scope so
 * each drill-down button carries it. Once mapped, the leaderboard's *default*
 * row formatting applies unchanged, so these render identically to every other
 * plain-count toplist.
 */
@Injectable()
export class DateToplistFactsService {
  constructor(
    private readonly dates: DateToplistService,
    private readonly leaderboard: LeaderboardService,
    private readonly monthDay: MonthDayService,
    private readonly buttonId: DateButtonIdService,
  ) {}

  private resolveDateToplist(options: {
    title: string;
    fetchRows: (limit: number) => Promise<DateMatchCount[]>;
    scope: FactScope;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<DateToplistRow>({
      title: options.title,
      fetchRows: async (limit) =>
        (await options.fetchRows(limit)).map((row) => ({
          ...row,
          name: this.monthDay.format({ month: row.month, day: row.day }),
        })),
      timeoutMessage: DATE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: DATE_TOPLIST_NO_DATA_MESSAGE,
      // Built per call rather than held as a field: the encoded id carries the
      // scope this toplist was viewed under, so clicking a row opens an
      // equally scoped `/onthisdate`.
      entityLink: {
        customIdPrefix: ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: (row) =>
          this.buttonId.encode(
            { month: row.month, day: row.day },
            options.scope,
          ),
      },
    });
  }

  resolveMatchesDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveDateToplist({
      title: 'Dates by matches played (descending)',
      fetchRows: (limit) =>
        this.dates.getMatchCountsByDateDescending(scope, limit),
      scope,
    });
  }

  resolveMatchesAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveDateToplist({
      title: 'Dates by matches played (ascending)',
      fetchRows: (limit) =>
        this.dates.getMatchCountsByDateAscending(scope, limit),
      scope,
    });
  }
}
