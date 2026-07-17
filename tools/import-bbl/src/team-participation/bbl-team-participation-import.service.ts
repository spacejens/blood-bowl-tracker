import type {
  ImportError,
  ImportResult,
  UpsertCompetitionData,
  UpsertRaceData,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  makeImportError,
  makeImportResult,
  MatchesImportService,
  RacesImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchDetailReaderService } from '../matches/bbl-match-detail-reader.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { MatchMergeResolution } from '../matches/match-merge.service';
import { MatchMergeService } from '../matches/match-merge.service';
import type { BblMatchDetails } from '../matches/match-teams-page-parser';
import { BblCompetitionStandingsReaderService } from './bbl-competition-standings-reader.service';

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
  ) {}

  /**
   * Derive team_eras, competition_teams, and race_eras from two sources of
   * competition membership, unioned per competition:
   *   1. Real match participation — for each competition, the distinct team ids
   *      of its completed matches, read from each match's own detail page
   *      (`p=m&m=<id>`) rather than the truncatable match-list names.
   *   2. The competition's standings page (`p=se&s=<id>`), which lists every
   *      registered team — including teams with a 0-0 record that played no
   *      matches (issue #155), which source 1 alone can never surface.
   * Each resulting team id is resolved to an imported team by page id; each
   * team's era is synced (yielding a team_eras id) and collected into the
   * competition's teamEraIds; the team's race is recorded against the
   * competition's era. The competition is then re-upserted with its
   * teamEraIds (writing competition_teams), and a final pass re-upserts each
   * race with the accumulated era ids (writing race_eras). All three syncs are
   * append-only. A registered-but-unplayed team simply contributes no
   * match_teams rows, which is correct. An unresolvable team id is recorded as
   * an error and skipped; it does not block the rest of the competition. A
   * competition with neither matches nor registered teams has nothing to
   * sync here and is skipped entirely; its own row (with an empty
   * teamEraIds) was already created upstream by BblCompetitionsImportService,
   * so this is not a missing import.
   * Idempotent.
   */
  async importTeamParticipation(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    teamsByCode: Map<string, UpsertTeamData>,
    racesByRaceId: Map<number, UpsertRaceData>,
    eraIdsByName: Map<string, number>,
    competitionIdsByBblId: Map<string, number>,
  ): Promise<{
    result: ImportResult;
    eraIdsByRaceId: Map<number, Set<number>>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const matchTeamsByBblId =
      await this.matchDetailReader.getMatchTeamsByBblId(errors);
    const merges = await this.matchMerge.resolve(errors);

    const teamIdsByCompetitionId = this.collectTeamIds(
      competitionsByBblId,
      matchesByCompetitionId,
      matchTeamsByBblId,
      errors,
    );

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

    const eraIdsByRaceId = new Map<number, Set<number>>();

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

        const eras = eraIdsByRaceId.get(team.raceId) ?? new Set<number>();
        eras.add(competition.eraId);
        eraIdsByRaceId.set(team.raceId, eras);
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
        merges,
        errors,
      );
    }

    for (const [raceId, eraIds] of eraIdsByRaceId) {
      const race = racesByRaceId.get(raceId);
      if (!race) {
        continue;
      }
      await this.racesImport.upsertRace({ ...race, eras: [...eraIds] }, errors);
    }

    return { result: makeImportResult({ imported, errors }), eraIdsByRaceId };
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
    matchTeamsByBblId: Map<string, BblMatchDetails>,
    teamEraIdByTeamId: Map<string, number>,
    competitionIdsByBblId: Map<string, number>,
    merges: MatchMergeResolution,
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
          playedAt: merges.effectivePlayedAt(match.bblId, match.date),
          name: teams.name,
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
    matchTeamsByBblId: Map<string, BblMatchDetails>,
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
