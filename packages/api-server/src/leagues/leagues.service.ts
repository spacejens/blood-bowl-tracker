import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { leagues } from '@blood-bowl-tracker/db';
import type { League, NewLeague } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class LeaguesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<League[]> {
    return this.db.select().from(leagues);
  }

  async findById(id: number): Promise<League | undefined> {
    const result = await this.db
      .select()
      .from(leagues)
      .where(eq(leagues.id, id));
    return result[0];
  }

  async create(data: NewLeague): Promise<League> {
    const result = await this.db.insert(leagues).values(data).returning();
    return result[0];
  }
}
