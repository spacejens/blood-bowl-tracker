import type { Db } from '@blood-bowl-tracker/db';
import { DB, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';

/**
 * Read-only rules-set count for the Discord bot's stats summary. Rules-set
 * ingestion and the importers' per-era listing are `RulesSetsService` in
 * packages/game-data.
 */
@Injectable()
export class RulesSetsQueriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  countAll(): Promise<number> {
    return countRows(this.db, rulesSets);
  }
}
