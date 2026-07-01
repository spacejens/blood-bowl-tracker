import { Inject, Injectable } from '@nestjs/common';
import { competitionTeams } from '@blood-bowl-tracker/db';
import type {
  CompetitionTeam,
  NewCompetitionTeam,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class CompetitionTeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<CompetitionTeam[]> {
    return this.db.select().from(competitionTeams);
  }

  async create(data: NewCompetitionTeam): Promise<CompetitionTeam> {
    const result = await this.db
      .insert(competitionTeams)
      .values(data)
      .returning();
    return result[0];
  }
}
