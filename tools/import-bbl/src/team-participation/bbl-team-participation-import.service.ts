import type {
  ImportError,
  ImportResult,
  UpsertCompetitionData,
  UpsertRulesSetData,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  makeImportError,
  makeImportResult,
  RulesSetsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { BblMatchDetailReaderService } from '../matches/bbl-match-detail-reader.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';

@Injectable()
export class BblTeamParticipationImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchDetailReader: BblMatchDetailReaderService,
    private readonly teamsImport: TeamsImportService,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly eraConfig: EraConfigService,
  ) {}

  /**
   * Derive team_eras, competition_teams, and race_rules_sets from real match
   * participation. For each competition, the distinct team ids of its completed
   * matches — read from each match's own detail page (`p=m&m=<id>`) rather than
   * the truncatable match-list names — are resolved to imported teams by page
   * id; each team's era is synced (yielding a team_eras id) and collected into
   * the competition's teamEraIds; the team's race is recorded against the era's
   * rules set. The competition is then re-upserted with its teamEraIds (writing
   * competition_teams), and a final pass re-upserts each rules set with the
   * accumulated race ids (writing race_rules_sets). All three syncs are
   * append-only. An unresolvable team id is recorded as an error and skipped; it
   * does not block the rest of the competition. Idempotent.
   */
  async importTeamParticipation(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    teamsByCode: Map<string, UpsertTeamData>,
    rulesSetsByName: Map<string, UpsertRulesSetData>,
    eraIdsByName: Map<string, number>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const rulesSetNameByEraId = new Map<number, string>();
    for (const era of this.eraConfig.getEras()) {
      const eraId = eraIdsByName.get(era.name);
      if (eraId !== undefined) {
        rulesSetNameByEraId.set(eraId, era.rulesSet);
      }
    }

    const teamIdsByCompetitionId = await this.collectTeamIds(
      competitionsByBblId,
      errors,
    );
    const raceIdsByRulesSetName = new Map<string, Set<number>>();

    for (const [bblId, competition] of competitionsByBblId) {
      const teamIds = teamIdsByCompetitionId.get(bblId);
      if (!teamIds || teamIds.size === 0) {
        continue;
      }

      const teamEraIds: number[] = [];
      for (const id of teamIds) {
        const team = teamsByCode.get(id);
        if (!team) {
          errors.push(
            makeImportError({
              item: { competition: competition.name, team: id },
              message: `Skipping match participation in competition "${competition.name}": could not resolve team id "${id}" to an imported team.`,
            }),
          );
          continue;
        }

        const upsertedTeam = await this.teamsImport.upsertTeam(
          { ...team, eras: [competition.eraId] },
          errors,
        );
        if (!upsertedTeam) {
          continue;
        }

        const teamEra = upsertedTeam.eras.find(
          (e) => e.eraId === competition.eraId,
        );
        if (teamEra) {
          teamEraIds.push(teamEra.id);
        }

        const rulesSetName = rulesSetNameByEraId.get(competition.eraId);
        if (rulesSetName !== undefined) {
          const races =
            raceIdsByRulesSetName.get(rulesSetName) ?? new Set<number>();
          races.add(team.raceId);
          raceIdsByRulesSetName.set(rulesSetName, races);
        }
      }

      if (teamEraIds.length > 0) {
        const success = await this.competitionsImport.upsertCompetition(
          { ...competition, teamEraIds },
          errors,
        );
        if (success) {
          imported += 1;
        }
      }
    }

    for (const [rulesSetName, raceIds] of raceIdsByRulesSetName) {
      const rulesSet = rulesSetsByName.get(rulesSetName);
      if (!rulesSet) {
        continue;
      }
      await this.rulesSetsImport.upsertRulesSet(
        { ...rulesSet, races: [...raceIds] },
        errors,
      );
    }

    return { result: makeImportResult({ imported, errors }) };
  }

  /**
   * Derive each competition's distinct team ids: group completed matches per
   * competition via the shared match-list reader (its single `ma` pass), then
   * resolve each match's two team ids from the shared match-detail reader (its
   * single `m` pass). A match whose id has no detail entry is recorded as an
   * error and skipped without affecting the rest of the competition.
   */
  private async collectTeamIds(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    errors: ImportError[],
  ): Promise<Map<string, Set<string>>> {
    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const matchTeamsByBblId =
      await this.matchDetailReader.getMatchTeamsByBblId(errors);
    const teamIdsByCompetitionId = new Map<string, Set<string>>();
    for (const [competitionId, matches] of matchesByCompetitionId) {
      const competitionName =
        competitionsByBblId.get(competitionId)?.name ?? competitionId;
      const ids = new Set<string>();
      for (const match of matches) {
        const teams = matchTeamsByBblId.get(match.bblId);
        if (!teams) {
          errors.push(
            makeImportError({
              item: { competition: competitionName, match: match.bblId },
              message: `Skipping match participation in competition "${competitionName}": could not find match details for match "${match.bblId}".`,
            }),
          );
          continue;
        }
        ids.add(teams.homeTeamId);
        ids.add(teams.awayTeamId);
      }
      teamIdsByCompetitionId.set(competitionId, ids);
    }
    return teamIdsByCompetitionId;
  }
}
