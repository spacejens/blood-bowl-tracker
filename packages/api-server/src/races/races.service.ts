import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { races } from '@blood-bowl-tracker/db';
import type { Race, NewRace } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class RacesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Race[]> {
    return this.db.select().from(races);
  }

  async findById(id: number): Promise<Race | undefined> {
    const result = await this.db.select().from(races).where(eq(races.id, id));
    return result[0];
  }

  async create(data: NewRace): Promise<Race> {
    const result = await this.db.insert(races).values(data).returning();
    return result[0];
  }
}
