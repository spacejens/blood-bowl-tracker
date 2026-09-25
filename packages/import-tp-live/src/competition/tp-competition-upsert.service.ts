import type {
  ImportError,
  ResolveResult,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';

/** A TP tournament's identity: all a competition upsert reads of it. */
export interface TpCompetitionTournament {
  id: number;
  name: string;
}

/** Options for {@link TpCompetitionUpsertService.upsertCompetition}. */
export interface UpsertTpCompetitionOptions {
  tournament: TpCompetitionTournament;
  /** Every dated match's date in the tournament. */
  playedDates: Date[];
  /** The era to import a new competition under, by name. */
  era: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /**
   * Whether an already-imported competition's era is overwritten from
   * `era`. Its type and dates are re-derived (merged with its own stored
   * dates, so its date range only ever widens) only when this call has new
   * `playedDates`; with none, its type and dates are left exactly as
   * already stored — notably, a stored `null` end date (meaning ongoing) is
   * never turned into a fixed date by this.
   * The full competition import (live standalone and `tpCompetitions.import`)
   * sees the whole competition's matches and sets this, matching BBL's and
   * TP's bulk import contract (see
   * `tools/import-manual/data/before-other-importers/competitions.json5`). A
   * live match import triggering this as a side effect of importing one
   * match leaves it false: it only knows that one match's date, not the
   * competition's full span.
   */
  overlayExisting?: boolean;
  errors: ImportError[];
}

/** What the later stages of a competition import need of an upserted competition. */
export interface UpsertedTpCompetition {
  tpSystemId: number;
  competitionId: number;
  /** TP's id of the competition: its external id under the TP system. */
  competitionTpId: number;
  /** The era the competition is stored under. */
  eraId: number;
  /** The competition's curated group. */
  competitionGroupId: number;
}

@Injectable()
export class TpCompetitionUpsertService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly span: TpCompetitionSpanService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts a TP tournament as a competition, keyed by its TP id. A brand-new
   * competition gets its era resolved by name and its type and start/end
   * dates derived from its matches' dates. An already-imported competition
   * has its name kept in sync and its external id link ensured; when
   * `overlayExisting` is set its era is always overwritten, and its type
   * and dates are re-derived from this call's match dates merged with its
   * stored dates (so the range only ever widens) whenever this call has new
   * match dates — with none, its type and dates are left exactly as
   * already stored, including a `null`/ongoing end date. A new competition
   * with no dated match fails; an already-stored one never does, since a
   * call with no new matches for it simply leaves its type and dates
   * unchanged.
   * It never sends a competition group: that classification is curated in
   * tools/import-manual and the database requires one, so a new competition
   * not already curated fails to be created and is reported. Resolves the
   * stored competition once upserted; each failure records one error and
   * resolves undefined.
   */
  async upsertCompetition({
    tournament,
    playedDates,
    era,
    externalSystemName,
    overlayExisting = false,
    errors,
  }: UpsertTpCompetitionOptions): Promise<UpsertedTpCompetition | undefined> {
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
    const externalIds = [
      { externalSystemId: tpSystemId, externalId: String(tournament.id) },
    ];
    const competitionRef = await this.competitions.resolve({
      externalSystemId: tpSystemId,
      externalId: String(tournament.id),
    });

    let fields: Pick<
      UpsertCompetition,
      'type' | 'eraId' | 'startDate' | 'endDate'
    > = {};
    if (!competitionRef.found || overlayExisting) {
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
        return undefined;
      }
      if (competitionRef.found && playedDates.length === 0) {
        fields = { eraId: eraRef.id };
      } else {
        const span = this.span.derive(
          await this.datesToDerive(competitionRef, playedDates),
        );
        if (span === undefined) {
          errors.push(
            this.importResults.error({
              item: { competition: tournament.id },
              message: `Skipping competition "${tournament.name}": no dated matches found.`,
            }),
          );
          return undefined;
        }
        fields = {
          type: span.type,
          eraId: eraRef.id,
          startDate: span.startDate,
          endDate: span.endDate,
        };
      }
    }
    const upserted = await this.runner.record({
      run: () =>
        this.competitions.upsert({
          name: tournament.name,
          ...fields,
          teamEraIds: [],
          externalIds,
        }),
      item: { competition: tournament.id },
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert competition "${tournament.name}" (TP id ${tournament.id}): ${this.runner.messageOf(error)}`,
    });
    if (upserted === undefined) {
      return undefined;
    }
    return {
      tpSystemId,
      competitionId: upserted.competition.id,
      competitionTpId: tournament.id,
      eraId: upserted.competition.eraId,
      competitionGroupId: upserted.competition.competitionGroupId,
    };
  }

  /**
   * The dates a competition's type and span are derived from, called only
   * when there are new dated matches to derive from (or the competition is
   * new): this call's played dates, plus an already-stored competition's
   * own start and end dates, so an overlay only ever widens the stored
   * range. Falls back to the played dates alone when the stored competition
   * cannot be read back.
   */
  private async datesToDerive(
    competitionRef: ResolveResult,
    playedDates: Date[],
  ): Promise<Date[]> {
    if (!competitionRef.found) {
      return playedDates;
    }
    const existing = await this.competitions.findById(competitionRef.id);
    if (existing === undefined) {
      return playedDates;
    }
    return [
      ...playedDates,
      new Date(existing.startDate),
      ...(existing.endDate === null ? [] : [new Date(existing.endDate)]),
    ];
  }
}
