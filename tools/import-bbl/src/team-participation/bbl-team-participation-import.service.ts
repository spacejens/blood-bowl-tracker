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
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';

@Injectable()
export class BblTeamParticipationImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly teamsImport: TeamsImportService,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly eraConfig: EraConfigService,
  ) {}

  /**
   * Derive team_eras, competition_teams, and race_rules_sets from real match
   * participation. For each competition, the distinct team names on its
   * completed match rows are resolved to imported teams; each team's era is
   * synced (yielding a team_eras id) and collected into the competition's
   * teamEraIds; the team's race is recorded against the era's rules set. The
   * competition is then re-upserted with its teamEraIds (writing
   * competition_teams), and a final pass re-upserts each rules set with the
   * accumulated race ids (writing race_rules_sets). All three syncs are
   * append-only. An unresolvable team name is recorded as an error and skipped;
   * it does not block the rest of the competition. Idempotent.
   */
  async importTeamParticipation(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    teamsByName: Map<string, UpsertTeamData>,
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

    const teamNamesByCompetitionId = await this.collectTeamNames(errors);
    const raceIdsByRulesSetName = new Map<string, Set<number>>();

    for (const [bblId, competition] of competitionsByBblId) {
      const teamNames = teamNamesByCompetitionId.get(bblId);
      if (!teamNames || teamNames.size === 0) {
        continue;
      }

      const teamEraIds: number[] = [];
      for (const name of teamNames) {
        const team = teamsByName.get(name);
        if (!team) {
          errors.push(
            makeImportError({
              item: { competition: competition.name, team: name },
              message: `Skipping match participation in competition "${competition.name}": could not resolve team "${name}" to an imported team.`,
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
   * Derive each competition's distinct completed-match team names via the
   * shared match-list reader, which performs the single pass over the ma
   * pages.
   */
  private async collectTeamNames(
    errors: ImportError[],
  ): Promise<Map<string, Set<string>>> {
    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const teamNamesByCompetitionId = new Map<string, Set<string>>();
    for (const [competitionId, matches] of matchesByCompetitionId) {
      const names = new Set<string>();
      for (const match of matches) {
        if (match.homeTeam) {
          names.add(match.homeTeam);
        }
        if (match.awayTeam) {
          names.add(match.awayTeam);
        }
      }
      teamNamesByCompetitionId.set(competitionId, names);
    }
    return teamNamesByCompetitionId;
  }
}
