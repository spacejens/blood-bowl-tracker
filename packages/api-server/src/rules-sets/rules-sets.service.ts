import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { rulesSets } from '@blood-bowl-tracker/db';
import type { RulesSet, NewRulesSet } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class RulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<RulesSet[]> {
    return this.db.select().from(rulesSets);
  }

  async findById(id: number): Promise<RulesSet | undefined> {
    const result = await this.db
      .select()
      .from(rulesSets)
      .where(eq(rulesSets.id, id));
    return result[0];
  }

  async create(data: NewRulesSet): Promise<RulesSet> {
    const result = await this.db.insert(rulesSets).values(data).returning();
    return result[0];
  }
}
