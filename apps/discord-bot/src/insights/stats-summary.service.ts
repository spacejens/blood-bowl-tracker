import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitions,
  DB,
  matches,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../database-timeout';

@Injectable()
export class StatsSummaryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  buildSummaryMessage(): Promise<string> {
    return withDatabaseTimeout(
      this.computeSummaryMessage(),
      DATABASE_TIMEOUT_FALLBACK_MESSAGE,
    );
  }

  private async computeSummaryMessage(): Promise<string> {
    const [
      coachCount,
      teamCount,
      matchCount,
      competitionCount,
      seasonCount,
      cupCount,
    ] = await Promise.all([
      this.countAll(coaches),
      this.countAll(teams),
      this.countAll(matches),
      this.countAll(competitions),
      this.countCompetitionsByType('season'),
      this.countCompetitionsByType('cup'),
    ]);

    return (
      `There have been ${coachCount} coaches and ${teamCount} teams. ` +
      `A total of ${matchCount} matches have been played in ` +
      `${competitionCount} competitions (${seasonCount} seasons, ${cupCount} cups)`
    );
  }

  private async countAll(table: PgTable): Promise<number> {
    const [row] = await this.db.select({ count: count() }).from(table);
    return row.count;
  }

  private async countCompetitionsByType(
    type: 'season' | 'cup',
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .where(eq(competitions.type, type));
    return row.count;
  }
}
