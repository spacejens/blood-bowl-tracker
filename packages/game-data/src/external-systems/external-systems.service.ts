import type { ExternalSystem, NewExternalSystem } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import { externalSystems } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { countRows } from '../shared/count-all';

@Injectable()
export class ExternalSystemsService {
  constructor(@Inject(DB) private readonly db: Db) {}

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

    const result = await this.db
      .insert(externalSystems)
      .values(data)
      .returning();
    return { system: result[0], created: true };
  }

  countAll(): Promise<number> {
    return countRows(this.db, externalSystems);
  }
}
