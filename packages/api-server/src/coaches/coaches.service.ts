import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { coaches } from '@blood-bowl-tracker/db';
import type { Coach, NewCoach } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class CoachesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Coach[]> {
    return this.db.select().from(coaches);
  }

  async findById(id: number): Promise<Coach | undefined> {
    const result = await this.db.select().from(coaches).where(eq(coaches.id, id));
    return result[0];
  }

  async create(data: NewCoach): Promise<Coach> {
    const result = await this.db.insert(coaches).values(data).returning();
    return result[0];
  }
}
