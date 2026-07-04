import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { coaches, coachExternalIds } from '@blood-bowl-tracker/db';
import type { Coach, NewCoach } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

export class CoachUpsertConflictError extends Error {}

export interface UpsertCoachData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class CoachesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Coach[]> {
    return this.db.select().from(coaches);
  }

  async findById(id: number): Promise<Coach | undefined> {
    const result = await this.db
      .select()
      .from(coaches)
      .where(eq(coaches.id, id));
    return result[0];
  }

  async create(data: NewCoach): Promise<Coach> {
    const result = await this.db.insert(coaches).values(data).returning();
    return result[0];
  }

  async upsert(
    data: UpsertCoachData,
  ): Promise<{ coach: Coach; created: boolean }> {
    const matches = await this.db
      .select({ coachId: coachExternalIds.coachId })
      .from(coachExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(coachExternalIds.externalSystemId, e.externalSystemId),
              eq(coachExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctCoachIds = [...new Set(matches.map((m) => m.coachId))];

    if (distinctCoachIds.length > 1) {
      throw new CoachUpsertConflictError(
        `External IDs matched multiple existing coaches: ${distinctCoachIds.join(', ')}`,
      );
    }

    let coach: Coach;
    const created = distinctCoachIds.length === 0;

    if (created) {
      coach = await this.create({ name: data.name });
    } else {
      const result = await this.db
        .update(coaches)
        .set({ name: data.name })
        .where(eq(coaches.id, distinctCoachIds[0]))
        .returning();
      coach = result[0];
    }

    await this.db
      .insert(coachExternalIds)
      .values(
        data.externalIds.map((e) => ({
          coachId: coach.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      )
      .onConflictDoNothing();

    return { coach, created };
  }
}
