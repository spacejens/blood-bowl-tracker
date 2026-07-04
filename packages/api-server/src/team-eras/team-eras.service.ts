import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { teamEras } from '@blood-bowl-tracker/db';
import type { TeamEra, NewTeamEra } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class TeamErasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<TeamEra[]> {
    return this.db.select().from(teamEras);
  }

  async findById(id: number): Promise<TeamEra | undefined> {
    const result = await this.db
      .select()
      .from(teamEras)
      .where(eq(teamEras.id, id));
    return result[0];
  }

  async create(data: NewTeamEra): Promise<TeamEra> {
    const result = await this.db.insert(teamEras).values(data).returning();
    return result[0];
  }
}
