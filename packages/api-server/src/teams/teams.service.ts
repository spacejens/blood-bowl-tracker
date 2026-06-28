import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { teams } from '@blood-bowl-tracker/db';
import type { NewTeam, Team } from '@blood-bowl-tracker/db';
import { DB } from '../db/db.module';
import type { Db } from '../db/db.module';

@Injectable()
export class TeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Team[]> {
    return this.db.select().from(teams);
  }

  async findById(id: number): Promise<Team | undefined> {
    const result = await this.db.select().from(teams).where(eq(teams.id, id));
    return result[0];
  }

  async create(data: NewTeam): Promise<Team> {
    const result = await this.db.insert(teams).values(data).returning();
    return result[0];
  }
}
