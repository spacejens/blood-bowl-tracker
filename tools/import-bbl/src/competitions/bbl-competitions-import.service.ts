import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchDateRangeService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import {
  CompetitionOverride,
  EraConfig,
  EraConfigService,
} from '../eras/era-config.service';
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
  eraIds: Map<string, number>;
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
  override: CompetitionOverride;
  eraName: string;
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
    private readonly lookup: ReferenceLookupService,
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
   */
  async importCompetitions(): Promise<{
    result: ImportResult;
    competitionsByBblId: Map<string, UpsertCompetition>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const competitionsByBblId = new Map<string, UpsertCompetition>();

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
      };
    }
    const [bblSystemId] = bootstrap.ids;

    // One round trip for the whole run: every era referenced here was
    // upserted moments ago by the preceding eras step, so it is already in
    // the database and resolvable by the same external id (its name) that
    // step wrote. Resolved once into a name-keyed map so the rest of this
    // method (and its private helpers) can keep looking eras up by name.
    const eraNames = [...new Set(eras.map((era) => era.identity.name))];
    const eraRefs = eraNames.map((name) => ({
      externalSystemId: bblSystemId,
      externalId: name,
    }));
    const resolvedEraIds = await this.lookup.lookupMap('era', eraRefs);
    const eraIds = new Map<string, number>();
    for (const name of eraNames) {
      const id = resolvedEraIds.get(
        this.lookup.keyOf({ externalSystemId: bblSystemId, externalId: name }),
      );
      if (id !== undefined) {
        eraIds.set(name, id);
      }
    }

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
      };
    }

    for (const competition of competitions) {
      const resolved = this.resolveTypeAndEra({
        competition,
        dates: datesByCompetitionId.get(competition.bblId) ?? [],
        eras,
        eraIds,
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
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      competitionsByBblId,
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
   * recording a skip error. A competition whose bblId appears in an era's
   * `competitions.overrides` is hard-assigned that era and that override's
   * type, unconditionally and ahead of any match-date resolution (mirroring
   * how playerIdOverrides pins a player to an era) — this is the only path
   * for a competition with a genuinely empty match list. Otherwise the era
   * and type are derived from the match dates: no dates => skip; span <= 3
   * days => cup, else season; earliest date matched against the configured
   * era ranges. An overridden competition takes its dates from its matches
   * when it has any, and otherwise from that override's own startDate/
   * endDate; with neither, it is skipped with a recorded error.
   */
  private resolveTypeAndEra({
    competition,
    dates,
    eras,
    eraIds,
    errors,
  }: ResolveTypeAndEraOptions): ResolvedCompetition | undefined {
    const match = this.findOverride(competition.bblId, eras);
    if (match !== undefined) {
      const { era: overrideEra, override } = match;
      const eraId = eraIds.get(overrideEra.identity.name);
      if (eraId === undefined) {
        errors.push(
          this.importResults.error({
            item: competition,
            message: `Skipping competition "${competition.name}" (id ${competition.bblId}): its configured era override "${overrideEra.identity.name}" could not be resolved.`,
          }),
        );
        return undefined;
      }
      const overrideDates = this.resolveOverrideDates({
        competition,
        dates,
        override,
        eraName: overrideEra.identity.name,
        errors,
      });
      if (overrideDates === undefined) {
        return undefined;
      }
      return { type: override.type, eraId, ...overrideDates };
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
      eraIds,
    );
    if (eraId === undefined) {
      const message =
        eraName === undefined
          ? `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${this.toIsoDay(range.earliestDate)} falls in no configured era.`
          : `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${this.toIsoDay(range.earliestDate)} falls in the configured era "${eraName}", which could not be resolved (its rules set may have failed to import).`;
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
   * The era whose `competitions.overrides` contains an entry for this bblId,
   * and that entry itself — or undefined if no era's overrides mention it.
   * `EraConfigService.getEras()` already guarantees a bblId appears in at
   * most one override across all eras, so the first match found is the only
   * one.
   */
  private findOverride(
    bblId: string,
    eras: EraConfig[],
  ): { era: EraConfig; override: CompetitionOverride } | undefined {
    for (const era of eras) {
      const override = era.competitions?.overrides?.find(
        (o) => o.bblId === bblId,
      );
      if (override !== undefined) {
        return { era, override };
      }
    }
    return undefined;
  }

  /**
   * Dates for a competition pinned to an era by an override. An override
   * exists either because the competition's date span would misclassify its
   * type or because it has no matches at all — so real match dates are still
   * preferred here when present, and only a truly match-less competition
   * falls back to that override's own configured startDate/endDate. With
   * neither, the competition is skipped rather than imported with no
   * startDate, so a future match-less override fails loudly instead of
   * silently storing null.
   */
  private resolveOverrideDates({
    competition,
    dates,
    override,
    eraName,
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
    if (override.startDate === undefined) {
      errors.push(
        this.importResults.error({
          item: competition,
          message: `Skipping competition "${competition.name}" (id ${competition.bblId}): it has no dated matches, and its override entry in era "${eraName}" has no startDate to take one from.`,
        }),
      );
      return undefined;
    }
    return { startDate: override.startDate, endDate: override.endDate };
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
    eraIds: Map<string, number>,
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
          eraId: eraIds.get(era.identity.name),
        };
      }
    }
    return { eraName: undefined, eraId: undefined };
  }
}
