import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { eras } from '@blood-bowl-tracker/db';
import type { Era, NewEra } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class ErasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Era[]> {
    return this.db.select().from(eras);
  }

  async findById(id: number): Promise<Era | undefined> {
    const result = await this.db.select().from(eras).where(eq(eras.id, id));
    return result[0];
  }

  async create(data: NewEra): Promise<Era> {
    const result = await this.db.insert(eras).values(data).returning();
    return result[0];
  }
}
