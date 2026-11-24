import type { DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  externalSystems,
  inArray,
  isNotNull,
  ne,
  or,
  playerAdvancements,
  playerExternalIds,
  players,
  positions,
  skills,
  sql,
  teamEras,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import { CHARACTERISTIC_KEY_BY_NAME } from './characteristic-keys';
import type {
  PaidAdvancementRow,
  StoredAdvancementRow,
  TeamPlayerRow,
} from './fill-plan.types';
import type {
  CandidateScopeRow,
  PaidAdvancementScope,
} from './fill-query.types';
import { INCOMPLETE_PLAYER, TP_NON_STAR_PLAYER } from './fill-query-conditions';

/**
 * The reads about the candidates (the incomplete non-star TP players) and
 * their team players (every non-star TP player of a candidate's team,
 * complete or not: the players the TP feed can report).
 */
@Injectable()
export class CandidateQueriesService {
  /** One row per candidate, named by his first TP id in text order. */
  async candidates(tx: DbOrTx): Promise<CandidateScopeRow[]> {
    return tx
      .selectDistinctOn([players.id], {
        playerId: players.id,
        tpId: playerExternalIds.externalId,
        teamId: teamEras.teamId,
        teamEraId: players.teamEraId,
        positionId: players.positionId,
        eraId: teamEras.eraId,
        sppTotal: players.sppTotal,
        unspentSpp: players.unspentSpp,
        status: players.status,
        isJourneyman: players.isJourneyman,
        move: players.move,
        strength: players.strength,
        agility: players.agility,
        passing: players.passing,
        armour: players.armour,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(playerExternalIds, eq(playerExternalIds.playerId, players.id))
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, playerExternalIds.externalSystemId),
      )
      .where(and(TP_NON_STAR_PLAYER, INCOMPLETE_PLAYER))
      .orderBy(players.id, playerExternalIds.externalId);
  }

  /** `isIncomplete` applies the conditions that select the candidates. */
  async teamPlayers(tx: DbOrTx, teamIds: number[]): Promise<TeamPlayerRow[]> {
    return tx
      .selectDistinctOn([players.id], {
        playerId: players.id,
        teamId: teamEras.teamId,
        eraId: teamEras.eraId,
        positionId: players.positionId,
        playerName: players.name,
        positionName: positions.name,
        sppTotal: players.sppTotal,
        unspentSpp: players.unspentSpp,
        isJourneyman: players.isJourneyman,
        isIncomplete: sql<boolean>`${INCOMPLETE_PLAYER}`,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(playerExternalIds, eq(playerExternalIds.playerId, players.id))
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, playerExternalIds.externalSystemId),
      )
      .where(and(TP_NON_STAR_PLAYER, inArray(teamEras.teamId, teamIds)))
      .orderBy(players.id);
  }

  async storedAdvancements(
    tx: DbOrTx,
    playerIds: number[],
  ): Promise<StoredAdvancementRow[]> {
    return tx
      .select({
        playerId: playerAdvancements.playerId,
        source: playerAdvancements.source,
        skillId: playerAdvancements.skillId,
        skillName: skills.name,
        attributeValue: playerAdvancements.attributeValue,
        isFreeExtra: playerAdvancements.isFreeExtra,
      })
      .from(playerAdvancements)
      .leftJoin(skills, eq(skills.id, playerAdvancements.skillId))
      .where(
        and(
          eq(playerAdvancements.removed, false),
          inArray(playerAdvancements.playerId, playerIds),
        ),
      );
  }

  /**
   * The stored paid advancements of every team player: gained skills with
   * their variant, and characteristic increases, neither removed nor free.
   * Read by team, then kept to the team players.
   */
  async paidAdvancements(
    tx: DbOrTx,
    scope: PaidAdvancementScope,
  ): Promise<PaidAdvancementRow[]> {
    const rows = await tx
      .select({
        playerId: playerAdvancements.playerId,
        skillId: playerAdvancements.skillId,
        attributeValue: playerAdvancements.attributeValue,
        characteristic: playerAdvancements.characteristic,
      })
      .from(playerAdvancements)
      .innerJoin(players, eq(players.id, playerAdvancements.playerId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .where(
        and(
          inArray(teamEras.teamId, scope.teamIds),
          eq(playerAdvancements.removed, false),
          ne(playerAdvancements.source, 'starting'),
          eq(playerAdvancements.isFreeExtra, false),
        ),
      );
    const teamPlayerIds = new Set(scope.playerIds);
    return rows
      .filter((row) => teamPlayerIds.has(row.playerId))
      .map((row) => ({
        playerId: row.playerId,
        skillId: row.skillId,
        attributeValue: row.attributeValue,
        characteristic:
          row.characteristic === null
            ? null
            : CHARACTERISTIC_KEY_BY_NAME[row.characteristic],
      }));
  }

  /**
   * Candidates holding an award of a trophy curated as granting a skill: the
   * award may have given him a skill outside his advancements, and a null
   * granted skill can mean it is not known yet. An award that records a
   * granted skill is a risk whatever its trophy is curated as.
   */
  async freeSkillRiskPlayerIds(
    tx: DbOrTx,
    playerIds: number[],
  ): Promise<number[]> {
    const rows = await tx
      .selectDistinct({
        // Never null: the filter keeps only candidate ids.
        playerId: sql<number>`${trophyAwards.playerId}`,
      })
      .from(trophyAwards)
      .innerJoin(trophies, eq(trophies.id, trophyAwards.trophyId))
      .where(
        and(
          inArray(trophyAwards.playerId, playerIds),
          or(
            eq(trophies.grantsSkill, true),
            isNotNull(trophyAwards.grantedSkillId),
          ),
        ),
      );
    return rows.map((row) => row.playerId);
  }
}
