import type {
  CompetitionType,
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
import { TpCompetitionClassifierService } from './tp-competition-classifier.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';

/** A TP tournament's identity: all a competition upsert reads of it. */
export interface TpCompetitionTournament {
  id: number;
  name: string;
}

/** Options for {@link TpCompetitionUpsertService.datesToDerive}. */
interface DatesToDeriveOptions {
  competitionRef: ResolveResult;
  playedDates: Date[];
  tournament: TpCompetitionTournament;
  errors: ImportError[];
}

/** Options for {@link TpCompetitionUpsertService.groupFields}. */
interface GroupFieldsOptions {
  competitionRef: ResolveResult;
  tournament: TpCompetitionTournament;
  errors: ImportError[];
}

/** What a competition's group decides about the fields it is upserted with. */
interface GroupFields {
  /**
   * A new competition's derived name and matched group; empty for a stored
   * competition, whose own are kept.
   */
  identity: Pick<UpsertCompetition, 'name' | 'competitionGroupId'>;
  /** The type the group shares, or undefined to use the date span's. */
  type: CompetitionType | undefined;
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
   * Whether an already-imported competition is overwritten from this call's
   * data instead of left as already stored. With new `playedDates`, its era
   * is overwritten and its type and dates re-derived from `era`/`playedDates`
   * merged with its own stored dates (so its date range only ever widens).
   * With none, era, type and start date stay exactly as stored. Either way,
   * an overlay of an unfinished competition resets its stored `endDate` to
   * null (see `finished`).
   * The full competition import (live standalone and `tpCompetitions.import`)
   * sees the whole competition's matches and awards and sets this, matching
   * BBL's and TP's bulk import contract (see
   * `tools/import-manual/data/before-other-importers/competitions.json5`). A
   * live match import triggering this as a side effect of importing one
   * match leaves it false: it only knows that one match's date, not the
   * competition's full span, nor whether it is finished, so it leaves a
   * stored competition's `endDate` untouched.
   */
  overlayExisting?: boolean;
  /**
   * Whether the competition is finished: TP has published its awards. Only a
   * finished competition's `endDate` is written from dates, as the latest of
   * its played dates and any stored end date; with no new played dates there
   * is nothing to derive it from and it is left as stored. An unfinished one
   * is created with a null `endDate`, and an overlay resets a stored
   * `endDate` to null, even with no new played dates. Its start date and type
   * still derive from its match dates either way.
   */
  finished?: boolean;
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
  /**
   * Whether this upsert created the competition, rather than updating one
   * already imported. Read only by the live imports, to decide whether to
   * backfill a brand-new competition's matches and teams.
   */
  created: boolean;
}

@Injectable()
export class TpCompetitionUpsertService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly span: TpCompetitionSpanService,
    private readonly classifier: TpCompetitionClassifierService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts a TP tournament as a competition, keyed by its TP id.
   *
   * A brand-new competition is classified by matching its raw TP name
   * against the curated competition groups' name patterns: exactly one match
   * gives it that group, a standard name continuing the group's numbering,
   * and the type every competition already in the group shares (falling back
   * to the date-span heuristic when they disagree or there are none). No
   * match, or more than one, fails it with an error saying which. Its era is
   * resolved by name and its start date derived from its matches' dates. Its
   * end date is derived too only when `finished`, and null otherwise.
   *
   * An already-imported competition keeps its stored name -- the curated or
   * derived standard name, never overwritten by TP's raw one -- has its
   * external id link ensured, and is never reclassified. When
   * `overlayExisting` is set and this call has new match dates, its era is
   * overwritten and its type and dates are re-derived from those dates
   * merged with its stored dates (so the range only ever widens), the type
   * again preferring the one its group shares; the end date is written only
   * when `finished`, and reset to null otherwise. When `overlayExisting` is
   * set with no new match dates, era, type and start date are left as
   * stored, and the end date is reset to null unless `finished`. Without
   * `overlayExisting`, a stored competition's fields are all left as stored.
   *
   * A new competition with no dated match fails; an already-stored one never
   * does, since a call with no new matches for it never has to derive
   * anything. Resolves the stored competition once upserted; each failure
   * records one error and resolves undefined.
   */
  async upsertCompetition({
    tournament,
    playedDates,
    era,
    externalSystemName,
    overlayExisting = false,
    finished = false,
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
      'name' | 'competitionGroupId' | 'type' | 'eraId' | 'startDate' | 'endDate'
    > = {};
    const derivesFields =
      !competitionRef.found || (overlayExisting && playedDates.length > 0);
    if (derivesFields) {
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
      const dates = await this.datesToDerive({
        competitionRef,
        playedDates,
        tournament,
        errors,
      });
      if (dates === undefined) {
        return undefined;
      }
      const span = this.span.derive(dates);
      if (span === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: tournament.id },
            message: `Skipping competition "${tournament.name}": no dated matches found.`,
          }),
        );
        return undefined;
      }
      const group = await this.groupFields({
        competitionRef,
        tournament,
        errors,
      });
      if (group === undefined) {
        return undefined;
      }
      fields = {
        ...group.identity,
        type: group.type ?? span.type,
        eraId: eraRef.id,
        startDate: span.startDate,
        ...this.endDateField({
          finished,
          resetsEndDate: !competitionRef.found || overlayExisting,
          endDate: span.endDate,
        }),
      };
    } else if (overlayExisting && !finished) {
      fields = { endDate: null };
    }
    const upserted = await this.runner.record({
      run: () =>
        this.competitions.upsert({
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
      created: upserted.created,
    };
  }

  /**
   * The end date to write alongside derived fields: the derived one for a
   * finished competition, null for an unfinished one that is new or
   * overlaid, and nothing (leaving the stored value) for an unfinished one
   * already stored that is not overlaid.
   */
  private endDateField({
    finished,
    resetsEndDate,
    endDate,
  }: {
    finished: boolean;
    resetsEndDate: boolean;
    endDate: string;
  }): Pick<UpsertCompetition, 'endDate'> {
    if (finished) {
      return { endDate };
    }
    return resetsEndDate ? { endDate: null } : {};
  }

  /**
   * What the competition's group decides. A stored competition keeps its
   * name and group, and only contributes the type its group shares. A new
   * one is classified by its raw name; when that is not confident -- no
   * group's pattern matches, or several do -- one error says which and this
   * resolves undefined, so the competition is skipped rather than left to
   * fail the database's NOT NULL group constraint. A classifier failure also
   * records one error and is treated as a skip.
   */
  private async groupFields({
    competitionRef,
    tournament,
    errors,
  }: GroupFieldsOptions): Promise<GroupFields | undefined> {
    const buildSkipMessage = (error: unknown): string =>
      `Skipping competition "${tournament.name}": ${this.runner.messageOf(error)}`;

    if (competitionRef.found) {
      const result = await this.runner.record({
        run: async () => ({
          type: await this.classifier.sharedTypeOfCompetitionGroup(
            competitionRef.id,
          ),
        }),
        item: { competition: tournament.id },
        errors,
        buildErrorMessage: buildSkipMessage,
      });
      if (result === undefined) {
        return undefined;
      }
      return { identity: {}, type: result.type };
    }
    const classification = await this.runner.record({
      run: () => this.classifier.classifyNew(tournament.name),
      item: { competition: tournament.id },
      errors,
      buildErrorMessage: buildSkipMessage,
    });
    if (classification === undefined) {
      return undefined;
    }
    if (classification.kind === 'classified') {
      return {
        identity: {
          name: classification.name,
          competitionGroupId: classification.competitionGroupId,
        },
        type: classification.type,
      };
    }
    const reason =
      classification.kind === 'unmatched'
        ? 'no competition group could be confidently matched.'
        : `matched multiple competition groups (${classification.groupNames.join(', ')}).`;
    errors.push(
      this.importResults.error({
        item: { competition: tournament.id },
        message: `Skipping competition "${tournament.name}": ${reason}`,
      }),
    );
    return undefined;
  }

  /**
   * The dates a competition's type and span are derived from, called only
   * when there are new dated matches to derive from (or the competition is
   * new): this call's played dates, plus an already-stored competition's
   * own start and end dates, so an overlay only ever widens the stored
   * range. Undefined when the competition was just resolved as existing but
   * its row cannot be read back, or that read fails outright — either way
   * the caller treats it as a failure and skips the competition, rather than
   * silently deriving from the played dates alone (which could shrink the
   * stored range or reclassify its type) or letting the read's rejection
   * propagate and abort the rest of the import. Records one error either
   * way, so this is the only place that reports a read failure.
   */
  private async datesToDerive({
    competitionRef,
    playedDates,
    tournament,
    errors,
  }: DatesToDeriveOptions): Promise<Date[] | undefined> {
    if (!competitionRef.found) {
      return playedDates;
    }
    const existing = await this.runner.record({
      run: async () => {
        const row = await this.competitions.findById(competitionRef.id);
        if (row === undefined) {
          throw new Error(
            'stored competition could not be read back after being resolved.',
          );
        }
        return row;
      },
      item: { competition: tournament.id },
      errors,
      buildErrorMessage: (error) =>
        `Skipping competition "${tournament.name}": ${this.runner.messageOf(error)}`,
    });
    if (existing === undefined) {
      return undefined;
    }
    return [
      ...playedDates,
      new Date(existing.startDate),
      ...(existing.endDate === null ? [] : [new Date(existing.endDate)]),
    ];
  }
}
