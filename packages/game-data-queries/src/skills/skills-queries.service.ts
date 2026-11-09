import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  competitions,
  countDistinct,
  DB,
  desc,
  eq,
  eraRulesSets,
  eras,
  inArray,
  playerAdvancements,
  players,
  positions,
  skillRulesSets,
  skills,
  teamEras,
} from '@blood-bowl-tracker/db';
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';

/** One skill and how many players hold it under the requested source filter. */
export interface SkillPlayerCount {
  skillId: number;
  name: string;
  count: number;
}

/**
 * The advancement sources, i.e. every source except `starting`. The ambiguous
 * `advancement` value is included on purpose: a source that records a skill as
 * gained without saying how (BBL) still gained it via advancement.
 */
const ADVANCEMENT_SOURCES: readonly PlayerSkillSource[] = [
  'advancement',
  'chosen',
  'random',
];

/**
 * Read-only skill counts and toplists for the Discord bot. Skill ingestion
 * is `SkillsService` in packages/game-data.
 */
@Injectable()
export class SkillsQueriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The shared ranking query behind all four skill-popularity toplists: skills
   * ranked by how many distinct players hold them, most-held first.
   *
   * `sources === undefined` means "any source" and applies no source filter at
   * all, which is why the "any" variant spans starting and gained skills alike.
   *
   * Grouped by `(skills.id, skills.name)` and NOT by
   * `playerAdvancements.attributeValue`, so a variant-carrying skill (Hatred (Elf)
   * vs. Hatred (Dwarf)) counts toward its base skill. The count is
   * `countDistinct(playerAdvancements.playerId)` rather than a row count for the same
   * reason: one player holding two variants of the same base skill is two
   * `player_advancements` rows but must count once.
   *
   * Star players are excluded via the `positions` join: their skill sets are
   * fixed and often unique to them, and each hire of a star is its own
   * `players` row, so including them would both skew the ranking and count one
   * star's skills once per hiring team. Same exclusion, same reason, as
   * `PositionsQueriesService.countPlayersByPosition` and
   * `PlayersService.topPlayersByTotalSpp`.
   *
   * League and era scope reach the player through their own team era - no
   * match-event join - because a player's skills are a snapshot property of the
   * player, not match-scoped data. That is also why there is no competition or
   * match-category branch here.
   *
   * The `teamEras`/`eras` joins are unconditional, unlike
   * `PositionsQueriesService.countPlayersByPosition`'s scope-dependent join: both
   * `players.teamEraId` and `players.positionId` are NOT NULL foreign keys, so
   * joining unconditionally never drops a row, and it keeps this query's shape
   * the same whether or not a scope is supplied.
   *
   * The name tiebreak keeps the truncation the `LIMIT` performs deterministic
   * when several skills share a count.
   */
  private rankSkillsByPlayerCount(
    scope: FactScope,
    limit: number,
    sources: readonly PlayerSkillSource[] | undefined,
  ): Promise<SkillPlayerCount[]> {
    const count = countDistinct(playerAdvancements.playerId);
    return this.db
      .select({ skillId: skills.id, name: skills.name, count })
      .from(playerAdvancements)
      .innerJoin(skills, eq(skills.id, playerAdvancements.skillId))
      .innerJoin(players, eq(players.id, playerAdvancements.playerId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(
          sources === undefined
            ? undefined
            : inArray(playerAdvancements.source, [...sources]),
          eq(positions.isStarPlayer, false),
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
        ),
      )
      .groupBy(skills.id, skills.name)
      .orderBy(desc(count), asc(skills.name))
      .limit(limit);
  }

  /** Skills ranked by players who have them, whatever the source. */
  countPlayersBySkillAny(
    scope: FactScope,
    limit: number,
  ): Promise<SkillPlayerCount[]> {
    return this.rankSkillsByPlayerCount(scope, limit, undefined);
  }

  /** Skills ranked by players who gained them as an advancement of any kind. */
  countPlayersBySkillAdvancement(
    scope: FactScope,
    limit: number,
  ): Promise<SkillPlayerCount[]> {
    return this.rankSkillsByPlayerCount(scope, limit, ADVANCEMENT_SOURCES);
  }

  /** Skills ranked by players who freely chose them as an advancement. */
  countPlayersBySkillChosen(
    scope: FactScope,
    limit: number,
  ): Promise<SkillPlayerCount[]> {
    return this.rankSkillsByPlayerCount(scope, limit, ['chosen']);
  }

  /** Skills ranked by players who randomly rolled them as an advancement. */
  countPlayersBySkillRandom(
    scope: FactScope,
    limit: number,
  ): Promise<SkillPlayerCount[]> {
    return this.rankSkillsByPlayerCount(scope, limit, ['random']);
  }

  /**
   * The catalogue counts behind the stats summary's `Skills:` line. These
   * count how many distinct skills are *defined* under the rules set(s) in
   * scope, matching Rules sets / Races / Positions — not how many skills
   * players actually hold, which is what the toplists above rank.
   *
   * `countAll` counts every skill in the catalogue, including one attached to
   * no rules set. The three scoped methods below only reach skills that are
   * attached to a rules set in scope, so a defined-but-unattached skill shows
   * up in the all-time count but not in any scoped one.
   *
   * `skill_rules_sets` and `era_rules_sets` are joined directly on
   * `rules_set_id`: both are NOT NULL foreign keys to the same `rules_sets`
   * row, so hopping through `rules_sets` itself would drop no rows and select
   * nothing.
   */
  countAll(): Promise<number> {
    return countRows(this.db, skills);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(skillRulesSets.skillId) })
      .from(skillRulesSets)
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, skillRulesSets.rulesSetId),
      )
      .where(eq(eraRulesSets.eraId, eraId));
    return row.count;
  }

  /**
   * A competition has no narrower rules-set scope than the era it runs in, so
   * this is the era count reached through the competition's own `eraId`.
   * Unlike `RacesQueriesService.countByCompetition` /
   * `PositionsQueriesService.countByCompetition`, which count what actually took part
   * (competition_teams -> team_eras), this stays a catalogue count: every
   * skill the era's rules set(s) define, not only ones held by a participant.
   */
  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(skillRulesSets.skillId) })
      .from(skillRulesSets)
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, skillRulesSets.rulesSetId),
      )
      .innerJoin(competitions, eq(competitions.eraId, eraRulesSets.eraId))
      .where(eq(competitions.id, competitionId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(skillRulesSets.skillId) })
      .from(skillRulesSets)
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, skillRulesSets.rulesSetId),
      )
      .innerJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }
}
