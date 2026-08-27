import type {
  UpsertCompetition,
  UpsertMatch,
  UpsertRace,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type {
  BatchBuffer,
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ImportResultService,
  MatchesImportService,
  RacesImportService,
  ReferenceLookupService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchDetailReaderService } from '../matches/bbl-match-detail-reader.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { MatchMergeResolution } from '../matches/match-merge.service';
import { MatchMergeService } from '../matches/match-merge.service';
import type { BblMatchDetails } from '../matches/match-teams-page-parser';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { BblCompetitionStandingsReaderService } from './bbl-competition-standings-reader.service';

export interface ImportTeamParticipationOptions {
  competitionsByBblId: Map<string, UpsertCompetition>;
  teamsByCode: Map<string, UpsertTeam>;
  racesByRaceId: Map<number, UpsertRace>;
}

interface CollectTeamIdsOptions {
  competitionsByBblId: Map<string, UpsertCompetition>;
  matchesByCompetitionId: Map<string, BblMatch[]>;
  matchTeamsByBblId: Map<string, BblMatchDetails>;
  errors: ImportError[];
}

interface SyncMatchTeamsOptions {
  competitionBblId: string;
  competition: UpsertCompetition;
  matches: BblMatch[];
  matchTeamsByBblId: Map<string, BblMatchDetails>;
  teamEraIdByTeamId: Map<string, number>;
  competitionIds: Map<string, number>;
  merges: MatchMergeResolution;
  matchBatch: BatchBuffer<UpsertMatch>;
  errors: ImportError[];
}

@Injectable()
export class BblTeamParticipationImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchDetailReader: BblMatchDetailReaderService,
    private readonly teamsImport: TeamsImportService,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly racesImport: RacesImportService,
    private readonly matchesImport: MatchesImportService,
    private readonly matchMerge: MatchMergeService,
    private readonly competitionStandingsReader: BblCompetitionStandingsReaderService,
    private readonly importResults: ImportResultService,
    private readonly upsertFieldNarrowing: UpsertFieldNarrowingService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Competition membership is unioned from two sources because neither is
   * complete alone: match participation misses a registered team with a 0-0
   * record that played nothing, which only the standings page (`p=se&s=<id>`)
   * lists. Team ids come from each match's own detail page (`p=m&m=<id>`)
   * rather than the match-list names, which BBL truncates.
   *
   * All three syncs are append-only. A competition with neither matches nor
   * registered teams is skipped entirely — its row was already created
   * upstream with an empty teamEraIds, so this is not a missing import.
   *
   * `teamEraIdsByCompetitionBblId` exposes the mapping this step already
   * builds so the outcome step can turn a trophy placement or a configured
   * override's team code into a team era.
   */
  async importTeamParticipation({
    competitionsByBblId,
    teamsByCode,
    racesByRaceId,
  }: ImportTeamParticipationOptions): Promise<{
    result: ImportResult;
    eraIdsByRaceId: Map<number, Set<number>>;
    teamEraIdsByCompetitionBblId: Map<string, Map<string, number>>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const matchBatch = this.matchesImport.createBatch(errors);
    const teamEraIdsByCompetitionBblId = new Map<string, Map<string, number>>();
    const eraIdsByRaceId = new Map<number, Set<number>>();

    // One round trip for the whole run: every competition referenced here was
    // upserted moments ago by the preceding competitions step, so it is
    // already in the database and resolvable by its BBL id. Matches need the
    // resolved DB id to set their `competitionId`.
    const competitionIds = await this.lookup.lookupMap(
      'competition',
      [...competitionsByBblId].map(([bblId, competition]) => ({
        externalSystemId: competition.externalIds[0].externalSystemId,
        externalId: bblId,
      })),
    );

    try {
      const matchesByCompetitionId =
        await this.matchListReader.getMatchesByCompetitionId(errors);
      const matchTeamsByBblId =
        await this.matchDetailReader.getMatchTeamsByBblId(errors);
      const merges = await this.matchMerge.resolve(errors);

      const teamIdsByCompetitionId = this.collectTeamIds({
        competitionsByBblId,
        matchesByCompetitionId,
        matchTeamsByBblId,
        errors,
      });

      const registeredTeamIdsByCompetitionId =
        await this.competitionStandingsReader.getRegisteredTeamIdsByCompetitionId(
          errors,
        );
      for (const [bblId, registeredIds] of registeredTeamIdsByCompetitionId) {
        const ids = teamIdsByCompetitionId.get(bblId) ?? new Set<string>();
        for (const id of registeredIds) {
          ids.add(id);
        }
        teamIdsByCompetitionId.set(bblId, ids);
      }

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
              this.importResults.error({
                item: { competition: competition.name, team: id },
                message: `Skipping match participation in competition "${competition.name}": could not resolve team id "${id}" to an imported team.`,
              }),
            );
            continue;
          }

          const competitionEraId =
            this.upsertFieldNarrowing.resolveDefiniteEraId(competition);
          const upsertedTeam = await this.teamsImport.upsertTeam(
            { ...team, eras: [competitionEraId] },
            errors,
          );
          if (!upsertedTeam) {
            continue;
          }

          const teamEra = upsertedTeam.eras.find(
            (e) => e.eraId === competitionEraId,
          );
          if (teamEra) {
            teamEraIds.push(teamEra.id);
            teamEraIdByTeamId.set(id, teamEra.id);
          }

          const teamRaceId =
            this.upsertFieldNarrowing.resolveDefiniteRaceId(team);
          const eras = eraIdsByRaceId.get(teamRaceId) ?? new Set<number>();
          eras.add(competitionEraId);
          eraIdsByRaceId.set(teamRaceId, eras);
        }

        teamEraIdsByCompetitionBblId.set(bblId, teamEraIdByTeamId);

        if (teamEraIds.length > 0) {
          const success = await this.competitionsImport.upsertCompetition(
            { ...competition, teamEraIds },
            errors,
          );
          if (success) {
            imported += 1;
          }
        }

        await this.syncMatchTeams({
          competitionBblId: bblId,
          competition,
          matches: matchesByCompetitionId.get(bblId) ?? [],
          matchTeamsByBblId,
          teamEraIdByTeamId,
          competitionIds,
          merges,
          matchBatch,
          errors,
        });
      }
    } finally {
      // Return value discarded on purpose: `imported` counts competitions
      // only — match re-upserts never incremented it on the single-item
      // path either.
      await this.matchesImport.flushBatch(matchBatch);
    }

    for (const [raceId, eraIds] of eraIdsByRaceId) {
      const race = racesByRaceId.get(raceId);
      if (!race) {
        continue;
      }
      await this.racesImport.upsert({ ...race, eras: [...eraIds] }, errors);
    }

    return {
      result: this.importResults.result({ imported, errors }),
      eraIdsByRaceId,
      teamEraIdsByCompetitionBblId,
    };
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
  private async syncMatchTeams(options: SyncMatchTeamsOptions): Promise<void> {
    const {
      competitionBblId,
      competition,
      matches,
      matchTeamsByBblId,
      teamEraIdByTeamId,
      competitionIds,
      merges,
      matchBatch,
      errors,
    } = options;
    const externalSystemId = competition.externalIds[0].externalSystemId;
    const competitionId = competitionIds.get(
      this.lookup.keyOf({ externalSystemId, externalId: competitionBblId }),
    );
    if (competitionId === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: competition.name },
          message: `Skipping match teams for competition "${competition.name}": it has no imported competition id.`,
        }),
      );
      return;
    }

    for (const match of matches) {
      const teams = matchTeamsByBblId.get(match.bblId);
      if (!teams) {
        continue;
      }
      const homeTeamEraId = teamEraIdByTeamId.get(teams.homeTeamId);
      const awayTeamEraId = teamEraIdByTeamId.get(teams.awayTeamId);
      if (homeTeamEraId === undefined || awayTeamEraId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: competition.name, match: match.bblId },
            message: `Skipping match teams for match "${match.bblId}" in competition "${competition.name}": could not resolve both team eras.`,
          }),
        );
        continue;
      }
      await this.matchesImport.addToBatch(matchBatch, {
        competitionId,
        playedAt: merges.effectivePlayedAt(match.bblId, match.date),
        name: teams.name,
        externalIds: [{ externalSystemId, externalId: match.bblId }],
        teamEraIds: [homeTeamEraId, awayTeamEraId],
      });
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
  private collectTeamIds({
    competitionsByBblId,
    matchesByCompetitionId,
    matchTeamsByBblId,
    errors,
  }: CollectTeamIdsOptions): Map<string, Set<string>> {
    const teamIdsByCompetitionId = new Map<string, Set<string>>();
    for (const [competitionId, matches] of matchesByCompetitionId) {
      const competitionName =
        competitionsByBblId.get(competitionId)?.name ?? competitionId;
      const ids = new Set<string>();
      for (const match of matches) {
        const teams = matchTeamsByBblId.get(match.bblId);
        if (!teams) {
          errors.push(
            this.importResults.error({
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
