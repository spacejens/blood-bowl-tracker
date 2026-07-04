import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { externalSystems } from '@blood-bowl-tracker/db';
import type { ExternalSystem, NewExternalSystem } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class ExternalSystemsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<ExternalSystem[]> {
    return this.db.select().from(externalSystems);
  }

  async findById(id: number): Promise<ExternalSystem | undefined> {
    const result = await this.db
      .select()
      .from(externalSystems)
      .where(eq(externalSystems.id, id));
    return result[0];
  }

  async create(data: NewExternalSystem): Promise<ExternalSystem> {
    const result = await this.db
      .insert(externalSystems)
      .values(data)
      .returning();
    return result[0];
  }

  async upsert(
    data: NewExternalSystem,
  ): Promise<{ system: ExternalSystem; created: boolean }> {
    const existing = await this.db
      .select()
      .from(externalSystems)
      .where(eq(externalSystems.name, data.name));

    if (existing[0]) {
      return { system: existing[0], created: false };
    }

    const system = await this.create(data);
    return { system, created: true };
  }
}
