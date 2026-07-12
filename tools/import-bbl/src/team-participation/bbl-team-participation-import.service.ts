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
import { MatchListPageParser } from '../matches/match-list-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';

const MATCH_LIST_PAGE_TYPE = 'ma';
const MATCH_LIST_SORT_BY_SEASON = 's';

@Injectable()
export class BblTeamParticipationImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly matchListPageParser: MatchListPageParser,
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
   * Collect each competition's distinct completed-match team names in one pass
   * over the ma pages. Only the season-sorted variant (`so=s`) is keyed by
   * competition id; the `&gr=` group-filter variant is a byte-identical
   * duplicate, so the first page seen per `s` wins. Per-page parse failures are
   * recorded and skipped.
   */
  private async collectTeamNames(
    errors: ImportError[],
  ): Promise<Map<string, Set<string>>> {
    const teamNamesByCompetitionId = new Map<string, Set<string>>();
    for await (const page of this.sourceReader.pages(MATCH_LIST_PAGE_TYPE)) {
      const competitionId = page.params.s;
      if (
        page.params.so !== MATCH_LIST_SORT_BY_SEASON ||
        competitionId === undefined ||
        teamNamesByCompetitionId.has(competitionId)
      ) {
        continue;
      }
      try {
        const names = new Set<string>();
        for (const match of this.matchListPageParser.extractMatches(page)) {
          if (match.homeTeam) {
            names.add(match.homeTeam);
          }
          if (match.awayTeam) {
            names.add(match.awayTeam);
          }
        }
        teamNamesByCompetitionId.set(competitionId, names);
      } catch (error) {
        errors.push(
          makeImportError({
            item: { page: page.params },
            message: `Failed to parse match list page ${JSON.stringify(page.params)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
        );
      }
    }
    return teamNamesByCompetitionId;
  }
}
