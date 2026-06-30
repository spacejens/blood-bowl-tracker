import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { competitions } from '@blood-bowl-tracker/db';
import type { Competition, NewCompetition } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class CompetitionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Competition[]> {
    return this.db.select().from(competitions);
  }

  async findById(id: number): Promise<Competition | undefined> {
    const result = await this.db.select().from(competitions).where(eq(competitions.id, id));
    return result[0];
  }

  async create(data: NewCompetition): Promise<Competition> {
    const result = await this.db.insert(competitions).values(data).returning();
    return result[0];
  }
}
