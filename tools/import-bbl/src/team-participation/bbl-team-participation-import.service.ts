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
  MatchesImportService,
  RulesSetsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { BblMatchDetailReaderService } from '../matches/bbl-match-detail-reader.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { BblMatchTeams } from '../matches/match-teams-page-parser';

@Injectable()
export class BblTeamParticipationImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchDetailReader: BblMatchDetailReaderService,
    private readonly teamsImport: TeamsImportService,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly eraConfig: EraConfigService,
    private readonly matchesImport: MatchesImportService,
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
    competitionIdsByBblId: Map<string, number>,
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

    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const matchTeamsByBblId =
      await this.matchDetailReader.getMatchTeamsByBblId(errors);

    const teamIdsByCompetitionId = this.collectTeamIds(
      competitionsByBblId,
      matchesByCompetitionId,
      matchTeamsByBblId,
      errors,
    );
    const raceIdsByRulesSetName = new Map<string, Set<number>>();

    for (const [bblId, competition] of competitionsByBblId) {
      const teamIds = teamIdsByCompetitionId.get(bblId);
      if (!teamIds || teamIds.size === 0) {
        continue;
      }

      const teamEraIds: number[] = [];
      const teamEraIdByTeamId = new Map<string, number>();
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
          teamEraIdByTeamId.set(id, teamEra.id);
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

      await this.syncMatchTeams(
        bblId,
        competition,
        matchesByCompetitionId.get(bblId) ?? [],
        matchTeamsByBblId,
        teamEraIdByTeamId,
        competitionIdsByBblId,
        errors,
      );
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
   * Upsert the match_teams join for each of a competition's completed matches:
   * resolve each match's home/away team ids (from the shared match-detail
   * reader) to the team-era ids collected while syncing this competition's
   * teams, then re-upsert the already-imported match with its [home, away]
   * teamEraIds so the API syncs match_teams (append-only). A competition with no
   * imported DB id, or a match whose two team ids do not both resolve, is
   * recorded as an error and skipped without affecting the rest. Idempotent.
   */
  private async syncMatchTeams(
    competitionBblId: string,
    competition: UpsertCompetitionData,
    matches: BblMatch[],
    matchTeamsByBblId: Map<string, BblMatchTeams>,
    teamEraIdByTeamId: Map<string, number>,
    competitionIdsByBblId: Map<string, number>,
    errors: ImportError[],
  ): Promise<void> {
    const competitionId = competitionIdsByBblId.get(competitionBblId);
    if (competitionId === undefined) {
      errors.push(
        makeImportError({
          item: { competition: competition.name },
          message: `Skipping match teams for competition "${competition.name}": it has no imported competition id.`,
        }),
      );
      return;
    }

    const externalSystemId = competition.externalIds[0].externalSystemId;

    for (const match of matches) {
      const teams = matchTeamsByBblId.get(match.bblId);
      if (!teams) {
        continue;
      }
      const homeTeamEraId = teamEraIdByTeamId.get(teams.homeTeamId);
      const awayTeamEraId = teamEraIdByTeamId.get(teams.awayTeamId);
      if (homeTeamEraId === undefined || awayTeamEraId === undefined) {
        errors.push(
          makeImportError({
            item: { competition: competition.name, match: match.bblId },
            message: `Skipping match teams for match "${match.bblId}" in competition "${competition.name}": could not resolve both team eras.`,
          }),
        );
        continue;
      }
      await this.matchesImport.upsertMatch(
        {
          competitionId,
          playedAt: match.date,
          externalIds: [{ externalSystemId, externalId: match.bblId }],
          teamEraIds: [homeTeamEraId, awayTeamEraId],
        },
        errors,
      );
    }
  }

  /**
   * Derive each competition's distinct team ids: group completed matches per
   * competition via the shared match-list reader (its single `ma` pass), then
   * resolve each match's two team ids from the shared match-detail reader (its
   * single `m` pass). The match maps are fetched once by the caller and
   * supplied here so this step reuses them. A match whose id has no detail
   * entry is recorded as an error and skipped without affecting the rest of
   * the competition.
   */
  private collectTeamIds(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    matchesByCompetitionId: Map<string, BblMatch[]>,
    matchTeamsByBblId: Map<string, BblMatchTeams>,
    errors: ImportError[],
  ): Map<string, Set<string>> {
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
