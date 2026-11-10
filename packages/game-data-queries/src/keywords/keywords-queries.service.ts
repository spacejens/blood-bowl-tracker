import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  countDistinct,
  DB,
  eq,
  eraRulesSets,
  eras,
  keywords,
  positionRulesSetKeywords,
  positionRulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';

/**
 * Read-only keyword counts for the Discord bot's stats summary. Keyword
 * ingestion and the importers' catalog listing are `KeywordsService` in
 * packages/game-data.
 */
@Injectable()
export class KeywordsQueriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The catalogue counts behind the stats summary's `Keywords:` line — how
   * many distinct keywords are *defined* under the rules set(s) in scope, the
   * same kind of count as Rules sets, Races, Positions and Skills. A keyword
   * reaches a rules set only through the positions that carry it, hence the
   * `position_rules_sets` hop.
   *
   * `countAll` counts every keyword in the catalogue, including one attached
   * to no position. The three scoped methods below only reach keywords
   * attached to a position under a rules set in scope, so a
   * defined-but-unattached keyword shows up in the all-time count but not in
   * any scoped one.
   *
   * `position_rules_sets` and `era_rules_sets` are joined directly on
   * `rules_set_id`: both are NOT NULL foreign keys to the same `rules_sets`
   * row, so hopping through `rules_sets` itself would drop no rows.
   */
  countAll(): Promise<number> {
    return countRows(this.db, keywords);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionRulesSetKeywords.keywordId) })
      .from(positionRulesSetKeywords)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetKeywords.positionRulesSetId),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .where(eq(eraRulesSets.eraId, eraId));
    return row.count;
  }

  /**
   * A competition has no narrower rules-set scope than the era it runs in, so
   * this is the era count reached through the competition's own `eraId`.
   * Unlike the race and position counts, which count what actually took part
   * (competition_teams -> team_eras), this stays a catalogue count: every
   * keyword the era's rules set(s) define, not only ones held by a
   * participant.
   */
  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionRulesSetKeywords.keywordId) })
      .from(positionRulesSetKeywords)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetKeywords.positionRulesSetId),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .innerJoin(competitions, eq(competitions.eraId, eraRulesSets.eraId))
      .where(eq(competitions.id, competitionId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionRulesSetKeywords.keywordId) })
      .from(positionRulesSetKeywords)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetKeywords.positionRulesSetId),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .innerJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }
}
