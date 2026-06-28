import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { matchEvents } from '@blood-bowl-tracker/db';
import type { MatchEvent, NewMatchEvent } from '@blood-bowl-tracker/db';
import { DB } from '../db/db.module';
import type { Db } from '../db/db.module';

@Injectable()
export class MatchEventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findByMatchId(matchId: number): Promise<MatchEvent[]> {
    return this.db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
  }

  async create(data: NewMatchEvent): Promise<MatchEvent> {
    const result = await this.db.insert(matchEvents).values(data).returning();
    return result[0];
  }
}
