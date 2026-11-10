import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, ilike, leagues } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';

/**
 * Read-only league lookups and counts for the Discord bot. League ingestion
 * is `LeaguesService` in packages/game-data.
 */
@Injectable()
export class LeaguesQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(eq(leagues.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(ilike(leagues.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  countAll(): Promise<number> {
    return countRows(this.db, leagues);
  }
}
