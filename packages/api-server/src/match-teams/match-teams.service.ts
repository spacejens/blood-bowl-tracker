import { Inject, Injectable } from '@nestjs/common';
import { matchTeams } from '@blood-bowl-tracker/db';
import type { MatchTeam, NewMatchTeam } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class MatchTeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<MatchTeam[]> {
    return this.db.select().from(matchTeams);
  }

  async create(data: NewMatchTeam): Promise<MatchTeam> {
    const result = await this.db.insert(matchTeams).values(data).returning();
    return result[0];
  }
}
