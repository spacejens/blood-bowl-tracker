import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import type { TpTournament } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TP_EXTERNAL_SYSTEM_NAME } from '../tp-external-system';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';

/** Options for {@link TpLiveCompetitionUpsertService.upsertCompetition}. */
export interface UpsertLiveCompetitionOptions {
  tournament: TpTournament;
  /** Every dated match's date in the tournament's fixture lists. */
  playedDates: Date[];
  /** The era to import the competition under, by name. */
  era: string;
  errors: ImportError[];
}

@Injectable()
export class TpLiveCompetitionUpsertService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly span: TpCompetitionSpanService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts a live-fetched TP tournament as a competition, keyed by its TP
   * id, with its name, era, and a type and start/end dates derived from its
   * fixtures' dates — the same fields tools/import-tp's bulk import sends. It
   * never sends a competition group: that classification is curated in
   * tools/import-manual and the database requires one, so a competition not
   * already curated fails to be created and is reported. Resolves true once
   * upserted; each failure records one error.
   */
  async upsertCompetition({
    tournament,
    playedDates,
    era,
    errors,
  }: UpsertLiveCompetitionOptions): Promise<boolean> {
    const tpSystem = await this.runner.record({
      run: () =>
        this.externalSystems.upsert({
          name: TP_EXTERNAL_SYSTEM_NAME,
          category: 'imported_data_source',
        }),
      item: { externalSystems: [TP_EXTERNAL_SYSTEM_NAME] },
      errors,
      buildErrorMessage: (error) => this.runner.messageOf(error),
    });
    if (tpSystem === undefined) {
      return false;
    }
    const tpSystemId = tpSystem.system.id;
    const eraRef = await this.eras.resolve({
      externalSystemId: tpSystemId,
      externalId: era,
    });
    if (!eraRef.found) {
      errors.push(
        this.importResults.error({
          item: { competition: tournament.id, era },
          message: `Skipping competition "${tournament.name}": era "${era}" does not exist.`,
        }),
      );
      return false;
    }
    const span = this.span.derive(playedDates);
    if (span === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: tournament.id },
          message: `Skipping competition "${tournament.name}": no dated matches found.`,
        }),
      );
      return false;
    }
    const upserted = await this.runner.record({
      run: () =>
        this.competitions.upsert({
          name: tournament.name,
          type: span.type,
          eraId: eraRef.id,
          startDate: span.startDate,
          endDate: span.endDate,
          teamEraIds: [],
          externalIds: [
            { externalSystemId: tpSystemId, externalId: String(tournament.id) },
          ],
        }),
      item: { competition: tournament.id },
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert competition "${tournament.name}" (TP id ${tournament.id}): ${this.runner.messageOf(error)}`,
    });
    return upserted !== undefined;
  }
}
