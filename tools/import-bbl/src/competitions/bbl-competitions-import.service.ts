import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchDateRangeService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfig, EraConfigService } from '../eras/era-config.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import {
  BblCompetition,
  CompetitionListPageParser,
} from './competition-list-page-parser';

const PLAYED_LIST_PAGE_TYPE = 'se';
const STANDINGS_LIST_PAGE_TYPE = 'sr';
// (latest - earliest) <= 3 days => cup, else season. Validated against all 74
// competitions in the mirror (see the competitions design doc); do not change.
const CUP_MAX_SPAN_DAYS = 3;

interface ResolveTypeAndEraOptions {
  competition: BblCompetition;
  dates: Date[];
  eras: EraConfig[];
  eraIdsByName: Map<string, number>;
  errors: ImportError[];
}

interface ResolvedCompetition {
  type: 'season' | 'cup';
  eraId: number;
  startDate: string;
  endDate: string | undefined;
}

interface ResolveOverrideDatesOptions {
  competition: BblCompetition;
  dates: Date[];
  era: EraConfig;
  errors: ImportError[];
}

@Injectable()
export class BblCompetitionsImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly competitionListPageParser: CompetitionListPageParser,
    private readonly matchListReader: BblMatchListReaderService,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly eraConfig: EraConfigService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
    private readonly dateRange: MatchDateRangeService,
  ) {}

  /**
   * Import every competition listed in the master dropdown on the se/sr pages.
   * A competition's type (season/cup) and era are derived from its match dates
   * (from its p=ma&so=s&s=<id> page): span <= 3 days => cup, else season; the
   * earliest match date, matched against the configured era date ranges, gives
   * the era. Each competition is keyed by its numeric BBL id (the `s` value)
   * under the configured BBL external system.
   * Competitions with no dated matches, or whose earliest date is outside every
   * configured era, are skipped with a recorded error. Idempotent.
   *
   * Also returns `competitionIdsByBblId`, mapping each imported competition's
   * BBL id to its DB id — `UpsertCompetition` (used for
   * `competitionsByBblId`) carries no DB id, but matches need one to set their
   * `competitionId`.
   */
  async importCompetitions(eraIdsByName: Map<string, number>): Promise<{
    result: ImportResult;
    competitionsByBblId: Map<string, UpsertCompetition>;
    competitionIdsByBblId: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const competitionsByBblId = new Map<string, UpsertCompetition>();
    const competitionIdsByBblId = new Map<string, number>();

    const bblSystemName = this.externalSystemName.getBblSystemName();

    let eras: EraConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [bblSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        competitionsByBblId,
        competitionIdsByBblId,
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: bblSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        competitionsByBblId,
        competitionIdsByBblId,
      };
    }
    const [bblSystemId] = bootstrap.ids;

    const datesByCompetitionId = await this.collectMatchDates(errors);
    const competitions = await this.readCompetitionList(errors);
    if (competitions === null) {
      errors.push(
        this.importResults.error({
          item: {
            pageTypes: [PLAYED_LIST_PAGE_TYPE, STANDINGS_LIST_PAGE_TYPE],
          },
          message:
            'Cannot import competitions: no se or sr page was found to read the ' +
            'master competition list from.',
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        competitionsByBblId,
        competitionIdsByBblId,
      };
    }

    for (const competition of competitions) {
      const resolved = this.resolveTypeAndEra({
        competition,
        dates: datesByCompetitionId.get(competition.bblId) ?? [],
        eras,
        eraIdsByName,
        errors,
      });
      if (resolved === undefined) {
        continue;
      }

      const competitionData: UpsertCompetition = {
        name: competition.name,
        type: resolved.type,
        eraId: resolved.eraId,
        startDate: resolved.startDate,
        ...(resolved.endDate !== undefined
          ? { endDate: resolved.endDate }
          : {}),
        teamEraIds: [],
        externalIds: [
          { externalSystemId: bblSystemId, externalId: competition.bblId },
        ],
      };
      const upserted = await this.competitionsImport.upsertCompetitionResult(
        competitionData,
        errors,
      );
      if (upserted !== undefined) {
        competitionsByBblId.set(competition.bblId, competitionData);
        competitionIdsByBblId.set(competition.bblId, upserted.id);
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      competitionsByBblId,
      competitionIdsByBblId,
    };
  }

  /**
   * Read every competition's match dates via the shared match-list reader,
   * which performs the single pass over the ma pages.
   */
  private async collectMatchDates(
    errors: ImportError[],
  ): Promise<Map<string, Date[]>> {
    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    return new Map(
      [...matchesByCompetitionId].map(([id, ms]) => [
        id,
        ms.map((m) => m.date),
      ]),
    );
  }

  /**
   * Read the master competition list off the first se page carrying an `s`
   * param (or, if no such se page exists, the first matching sr page) — both
   * embed the identical dropdown. The bare `default.asp?p=se`/`p=sr` index
   * pages (no `s` param) have a different layout that lacks the dropdown
   * entirely and are skipped. Returns null if no matching page exists, or if
   * a parse fails (the failure is recorded as an error; parse errors do not
   * fall through to sr).
   */
  private async readCompetitionList(
    errors: ImportError[],
  ): Promise<BblCompetition[] | null> {
    for (const type of [PLAYED_LIST_PAGE_TYPE, STANDINGS_LIST_PAGE_TYPE]) {
      for await (const page of this.sourceReader.pages(type)) {
        if (page.params.s === undefined) {
          continue;
        }
        try {
          return this.competitionListPageParser.extractCompetitions(page);
        } catch (error) {
          errors.push(
            this.pageParseError.build(
              page.params,
              'master competition list',
              error,
            ),
          );
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Resolve a competition's type and era DB id, or return undefined after
   * recording a skip error. A competition whose bblId is listed in an era's
   * seasonCompetitionIdOverrides is hard-assigned that era with type 'season';
   * one listed in cupCompetitionIdOverrides is hard-assigned that era with
   * type 'cup'. Either override applies unconditionally and ahead of any
   * match-date resolution (mirroring how playerIdOverrides pins a player to
   * an era) — this is the only path for a competition with a genuinely empty
   * match list. Otherwise the era and type are derived from the match dates:
   * no dates => skip; span <= 3 days => cup, else season; earliest date
   * matched against the configured era ranges. An overridden competition
   * takes its dates from its matches when it has any, and otherwise from the
   * era's `competitions.dateOverrides` entry for its bblId; with neither, it
   * is skipped with a recorded error.
   */
  private resolveTypeAndEra({
    competition,
    dates,
    eras,
    eraIdsByName,
    errors,
  }: ResolveTypeAndEraOptions): ResolvedCompetition | undefined {
    const seasonOverrideEra = eras.find((era) =>
      era.competitions?.seasonCompetitionIdOverrides?.includes(
        competition.bblId,
      ),
    );
    const cupOverrideEra = eras.find((era) =>
      era.competitions?.cupCompetitionIdOverrides?.includes(competition.bblId),
    );
    const overrideEra = seasonOverrideEra ?? cupOverrideEra;
    if (overrideEra !== undefined) {
      const overrideType = seasonOverrideEra !== undefined ? 'season' : 'cup';
      const eraId = eraIdsByName.get(overrideEra.identity.name);
      if (eraId === undefined) {
        errors.push(
          this.importResults.error({
            item: competition,
            message: `Skipping competition "${competition.name}" (id ${competition.bblId}): its configured era override "${overrideEra.identity.name}" has no known database id (its rules set may have failed to import).`,
          }),
        );
        return undefined;
      }
      const overrideDates = this.resolveOverrideDates({
        competition,
        dates,
        era: overrideEra,
        errors,
      });
      if (overrideDates === undefined) {
        return undefined;
      }
      return { type: overrideType, eraId, ...overrideDates };
    }

    if (dates.length === 0) {
      errors.push(
        this.importResults.error({
          item: competition,
          message: `Skipping competition "${competition.name}" (id ${competition.bblId}): no dated matches found.`,
        }),
      );
      return undefined;
    }

    const range = this.dateRange.computeRange(dates);
    const type = range.spanDays <= CUP_MAX_SPAN_DAYS ? 'cup' : 'season';

    const { eraName, eraId } = this.resolveEraId(
      range.earliestDate,
      eras,
      eraIdsByName,
    );
    if (eraId === undefined) {
      const message =
        eraName === undefined
          ? `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${this.toIsoDay(range.earliestDate)} falls in no configured era.`
          : `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${this.toIsoDay(range.earliestDate)} falls in the configured era "${eraName}", which has no known database id (its rules set may have failed to import).`;
      errors.push(this.importResults.error({ item: competition, message }));
      return undefined;
    }

    return {
      type,
      eraId,
      startDate: this.toIsoDay(range.earliestDate),
      endDate: this.toIsoDay(range.latestDate),
    };
  }

  /**
   * Dates for a competition pinned to an era by an override. An override
   * exists either because the competition's date span would misclassify its
   * type or because it has no matches at all — so real match dates are still
   * preferred here when present, and only a truly match-less competition
   * falls back to the era's configured dateOverrides entry. With neither, the
   * competition is skipped rather than imported with no startDate, so a
   * future match-less override fails loudly instead of silently storing null.
   */
  private resolveOverrideDates({
    competition,
    dates,
    era,
    errors,
  }: ResolveOverrideDatesOptions):
    { startDate: string; endDate: string | undefined } | undefined {
    if (dates.length > 0) {
      const range = this.dateRange.computeRange(dates);
      return {
        startDate: this.toIsoDay(range.earliestDate),
        endDate: this.toIsoDay(range.latestDate),
      };
    }
    const configured = era.competitions?.dateOverrides?.[competition.bblId];
    if (configured === undefined) {
      errors.push(
        this.importResults.error({
          item: competition,
          message: `Skipping competition "${competition.name}" (id ${competition.bblId}): it has no dated matches, and its override era "${era.identity.name}" has no competitions.dateOverrides entry for id ${competition.bblId} to take a startDate from.`,
        }),
      );
      return undefined;
    }
    return { startDate: configured.startDate, endDate: configured.endDate };
  }

  /** A Date as the ISO `YYYY-MM-DD` day string the API contract expects. */
  private toIsoDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /**
   * Find the configured era whose [startDate, endDate) range (start inclusive,
   * end exclusive; an omitted endDate is open-ended) contains the given date,
   * and resolve its name to a DB id. ISO date strings compare correctly
   * lexicographically. `eraName` is the name of the era whose date range
   * contains the date (undefined if none does); `eraId` is that era's known
   * DB id (undefined if no era's range contains the date, or if it does but
   * the era has no known id — e.g. its rules set failed to import earlier).
   */
  private resolveEraId(
    date: Date,
    eras: EraConfig[],
    eraIdsByName: Map<string, number>,
  ): { eraName: string | undefined; eraId: number | undefined } {
    const day = this.toIsoDay(date);
    for (const era of eras) {
      if (era.dates.autoAssignByDate === false) {
        continue;
      }
      if (
        day >= era.dates.startDate &&
        (era.dates.endDate === undefined || day < era.dates.endDate)
      ) {
        return {
          eraName: era.identity.name,
          eraId: eraIdsByName.get(era.identity.name),
        };
      }
    }
    return { eraName: undefined, eraId: undefined };
  }
}
