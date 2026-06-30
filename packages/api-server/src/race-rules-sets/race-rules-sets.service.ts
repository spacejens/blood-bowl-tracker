import { Inject, Injectable } from '@nestjs/common';
import { raceRulesSets } from '@blood-bowl-tracker/db';
import type { RaceRulesSet, NewRaceRulesSet } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class RaceRulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<RaceRulesSet[]> {
    return this.db.select().from(raceRulesSets);
  }

  async create(data: NewRaceRulesSet): Promise<RaceRulesSet> {
    const result = await this.db.insert(raceRulesSets).values(data).returning();
    return result[0];
  }
}
