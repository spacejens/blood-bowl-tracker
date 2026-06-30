import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { positions } from '@blood-bowl-tracker/db';
import type { Position, NewPosition } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Position[]> {
    return this.db.select().from(positions);
  }

  async findById(id: number): Promise<Position | undefined> {
    const result = await this.db
      .select()
      .from(positions)
      .where(eq(positions.id, id));
    return result[0];
  }

  async create(data: NewPosition): Promise<Position> {
    const result = await this.db.insert(positions).values(data).returning();
    return result[0];
  }
}
