import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { matches } from '@blood-bowl-tracker/db';
import type { Match, NewMatch } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class MatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Match[]> {
    return this.db.select().from(matches);
  }

  async findById(id: number): Promise<Match | undefined> {
    const result = await this.db.select().from(matches).where(eq(matches.id, id));
    return result[0];
  }

  async create(data: NewMatch): Promise<Match> {
    const result = await this.db.insert(matches).values(data).returning();
    return result[0];
  }
}
