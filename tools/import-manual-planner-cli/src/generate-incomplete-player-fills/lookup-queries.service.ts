import type { DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  competitionExternalIds,
  competitions,
  competitionTeams,
  eq,
  externalSystems,
  inArray,
  isNotNull,
  isNull,
  matches,
  matchTeams,
  playerAdvancements,
  positionExternalIds,
  positionRulesSetSkills,
  skillExternalIds,
  skills,
  sql,
  teamEras,
  teamExternalIds,
} from '@blood-bowl-tracker/db';
import {
  NAME_EXTERNAL_SYSTEM_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { SkillNameRow, TeamRosterRow } from './fill-plan.types';
import type { OngoingCompetitionRow } from './fill-query.types';
import type { TpPositionIdRow, TpSkillIdRow } from './snapshot-fill.types';

/** The reads that name things: competitions in progress, external ids, and skill names. */
@Injectable()
export class LookupQueriesService {
  /**
   * Every team of an ongoing competition: enrolled in it, or a side in one
   * of its matches. A competition is ongoing when it has a `tourplay.net` id
   * and no end date; the TP importers store an end date only once TP shows
   * it finished. A player of such a team may still be active and gaining
   * SPP, so he is not filled. A competition with no team has no row.
   */
  async ongoingCompetitions(tx: DbOrTx): Promise<OngoingCompetitionRow[]> {
    const ongoing = await tx
      .selectDistinct({
        competitionId: competitions.id,
        competitionName: competitions.name,
      })
      .from(competitions)
      .innerJoin(
        competitionExternalIds,
        eq(competitionExternalIds.competitionId, competitions.id),
      )
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, competitionExternalIds.externalSystemId),
      )
      .where(
        and(
          isNull(competitions.endDate),
          eq(externalSystems.name, TP_EXTERNAL_SYSTEM_NAME),
        ),
      );
    if (ongoing.length === 0) {
      return [];
    }
    const ids = ongoing.map((competition) => competition.competitionId);
    const enrolled = await tx
      .selectDistinct({
        competitionId: competitionTeams.competitionId,
        teamId: teamEras.teamId,
      })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .where(inArray(competitionTeams.competitionId, ids));
    const playing = await tx
      .selectDistinct({
        competitionId: matches.competitionId,
        teamId: teamEras.teamId,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(inArray(matches.competitionId, ids));
    const teams = [...enrolled, ...playing];
    return ongoing.flatMap((competition) =>
      [
        ...new Set(
          teams
            .filter((team) => team.competitionId === competition.competitionId)
            .map((team) => team.teamId),
        ),
      ].map((teamId) => ({ ...competition, teamId })),
    );
  }

  /** The TP roster id (`tourplay.net` external id) of each given team. */
  async teamRosters(tx: DbOrTx, teamIds: number[]): Promise<TeamRosterRow[]> {
    if (teamIds.length === 0) {
      return [];
    }
    return tx
      .selectDistinct({
        teamId: teamExternalIds.teamId,
        rosterId: teamExternalIds.externalId,
      })
      .from(teamExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, teamExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(externalSystems.name, TP_EXTERNAL_SYSTEM_NAME),
          inArray(teamExternalIds.teamId, teamIds),
        ),
      );
  }

  /** Every `Name`-system id of every skill, with the skill's stored name. */
  async skillNames(tx: DbOrTx): Promise<SkillNameRow[]> {
    return tx
      .select({
        skillId: skillExternalIds.skillId,
        skillName: skills.name,
        nameId: skillExternalIds.externalId,
      })
      .from(skillExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, skillExternalIds.externalSystemId),
      )
      .innerJoin(skills, eq(skills.id, skillExternalIds.skillId))
      .where(eq(externalSystems.name, NAME_EXTERNAL_SYSTEM_NAME));
  }

  /**
   * Every `tourplay.net` id of every skill: the skillMasterIds TP names it
   * by, one per rules set. A roster snapshot names a player's skills only by
   * these ids.
   */
  async tpSkillIds(tx: DbOrTx): Promise<TpSkillIdRow[]> {
    return tx
      .select({
        skillId: skillExternalIds.skillId,
        masterId: skillExternalIds.externalId,
      })
      .from(skillExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, skillExternalIds.externalSystemId),
      )
      .where(eq(externalSystems.name, TP_EXTERNAL_SYSTEM_NAME));
  }

  /** Every `tourplay.net` id of each given position: the lineUpMasterIds TP lists it by. */
  async tpPositionIds(
    tx: DbOrTx,
    positionIds: number[],
  ): Promise<TpPositionIdRow[]> {
    if (positionIds.length === 0) {
      return [];
    }
    return tx
      .selectDistinct({
        positionId: positionExternalIds.positionId,
        tpPositionId: positionExternalIds.externalId,
      })
      .from(positionExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, positionExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(externalSystems.name, TP_EXTERNAL_SYSTEM_NAME),
          inArray(positionExternalIds.positionId, positionIds),
        ),
      );
  }

  /**
   * Every skill a player or a position holds with a variant. A roster
   * snapshot names a skill by its bare id, so it cannot say which variant a
   * player gained.
   */
  async attributedSkillIds(tx: DbOrTx): Promise<number[]> {
    const ofPlayers = await tx
      .selectDistinct({
        // Never null: the filter keeps only skill rows.
        skillId: sql<number>`${playerAdvancements.skillId}`,
      })
      .from(playerAdvancements)
      .where(
        and(
          isNotNull(playerAdvancements.attributeValue),
          isNotNull(playerAdvancements.skillId),
        ),
      );
    const ofPositions = await tx
      .selectDistinct({ skillId: positionRulesSetSkills.skillId })
      .from(positionRulesSetSkills)
      .where(isNotNull(positionRulesSetSkills.attributeValue));
    return [
      ...new Set([...ofPlayers, ...ofPositions].map((row) => row.skillId)),
    ];
  }
}
