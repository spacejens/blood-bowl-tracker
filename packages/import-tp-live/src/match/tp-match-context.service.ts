import type {
  CompetitionType,
  ImportError,
} from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsService,
  ExternalSystemsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** What every write of one match import needs, resolved once up front. */
export interface TpMatchContext {
  tpSystemId: number;
  competitionId: number;
  /** TP's id of the competition: its external id under the TP system. */
  competitionTpId: number;
  /** The competition's type: cups never get a season playoff category. */
  competitionType: CompetitionType;
  /** The competition's era: the era both teams played the match in. */
  eraId: number;
  homeTeamEraId: number;
  awayTeamEraId: number;
}

/** Options for {@link TpMatchContextService.resolve}. */
export interface ResolveMatchContextOptions {
  match: TpMatch;
  competitionTpId: number;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  errors: ImportError[];
}

@Injectable()
export class TpMatchContextService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly competitions: CompetitionsService,
    private readonly teams: TeamsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts TP's external system, then resolves the match's competition by
   * its TP id (for its database id, type and era) and each participating
   * team by its TP roster id to its team era in that era. A match file
   * carries no competition of its own, so the caller names it. The
   * competition and both teams must already be imported; anything that
   * cannot be resolved records one error and resolves nothing.
   */
  async resolve({
    match,
    competitionTpId,
    externalSystemName,
    errors,
  }: ResolveMatchContextOptions): Promise<TpMatchContext | undefined> {
    const tpSystem = await this.runner.record({
      run: () =>
        this.externalSystems.upsert({
          name: externalSystemName,
          category: 'imported_data_source',
        }),
      item: { externalSystems: [externalSystemName] },
      errors,
      buildErrorMessage: (error) => this.runner.messageOf(error),
    });
    if (tpSystem === undefined) {
      return undefined;
    }
    const tpSystemId = tpSystem.system.id;

    const competitionRef = await this.competitions.resolve({
      externalSystemId: tpSystemId,
      externalId: String(competitionTpId),
    });
    const competition = competitionRef.found
      ? await this.competitions.findById(competitionRef.id)
      : undefined;
    if (competition === undefined) {
      errors.push(
        this.importResults.error({
          item: { match: match.id, competition: competitionTpId },
          message: `Skipping match ${match.id}: its competition (TP id ${competitionTpId}) is not imported.`,
        }),
      );
      return undefined;
    }

    const [home, away] = await this.teams.resolveBatch([
      { externalSystemId: tpSystemId, externalId: String(match.homeTeamTpId) },
      { externalSystemId: tpSystemId, externalId: String(match.awayTeamTpId) },
    ]);
    const homeTeamEraId = home.found
      ? await this.teams.findTeamEraId(home.id, competition.eraId)
      : undefined;
    const awayTeamEraId = away.found
      ? await this.teams.findTeamEraId(away.id, competition.eraId)
      : undefined;
    if (homeTeamEraId === undefined || awayTeamEraId === undefined) {
      const rosters = [
        ...(homeTeamEraId === undefined ? [match.homeTeamTpId] : []),
        ...(awayTeamEraId === undefined ? [match.awayTeamTpId] : []),
      ];
      errors.push(
        this.importResults.error({
          item: { match: match.id, rosters },
          message: `Skipping match ${match.id}: could not resolve the team era of roster(s) ${rosters.join(', ')} in its competition's era.`,
        }),
      );
      return undefined;
    }

    return {
      tpSystemId,
      competitionId: competition.id,
      competitionTpId,
      competitionType: competition.type,
      eraId: competition.eraId,
      homeTeamEraId,
      awayTeamEraId,
    };
  }
}
