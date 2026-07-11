import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfig, EraConfigService } from '../eras/era-config.service';
import { MatchListPageParser } from '../matches/match-list-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import {
  BblCompetition,
  CompetitionListPageParser,
} from './competition-list-page-parser';

const MATCH_LIST_PAGE_TYPE = 'ma';
const PLAYED_LIST_PAGE_TYPE = 'se';
const STANDINGS_LIST_PAGE_TYPE = 'sr';
const MATCH_LIST_SORT_BY_SEASON = 's';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// (latest - earliest) <= 3 days => cup, else season. Validated against all 74
// competitions in the mirror (see the competitions design doc); do not change.
const CUP_MAX_SPAN_DAYS = 3;

@Injectable()
export class BblCompetitionsImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly competitionListPageParser: CompetitionListPageParser,
    private readonly matchListPageParser: MatchListPageParser,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly eraConfig: EraConfigService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every competition listed in the master dropdown on the se/sr pages.
   * A competition's type (season/cup) and era are derived from its match dates
   * (from its p=ma&so=s&s=<id> page): span <= 3 days => cup, else season; the
   * earliest match date, matched against the configured era date ranges, gives
   * the era. Each competition is keyed by its numeric BBL id (the `s` value)
   * under the configured BBL external system and by its exact name under Name.
   * Competitions with no dated matches, or whose earliest date is outside every
   * configured era, are skipped with a recorded error. Idempotent.
   */
  async importCompetitions(
    eraIdsByName: Map<string, number>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    let bblSystemId: number;
    let nameSystemId: number;
    let eras: EraConfig[];
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      eras = this.eraConfig.getEras();
      bblSystemId =
        await this.externalSystemsImport.upsertExternalSystem(bblSystemName);
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: { externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return { result: makeImportResult({ imported, errors }) };
    }

    const datesByCompetitionId = await this.collectMatchDates(errors);
    const competitions = await this.readCompetitionList(errors);
    if (competitions === null) {
      errors.push(
        makeImportError({
          item: {
            pageTypes: [PLAYED_LIST_PAGE_TYPE, STANDINGS_LIST_PAGE_TYPE],
          },
          message:
            'Cannot import competitions: no se or sr page was found to read the ' +
            'master competition list from.',
        }),
      );
      return { result: makeImportResult({ imported, errors }) };
    }

    for (const competition of competitions) {
      const dates = datesByCompetitionId.get(competition.bblId) ?? [];
      if (dates.length === 0) {
        errors.push(
          makeImportError({
            item: competition,
            message: `Skipping competition "${competition.name}" (id ${competition.bblId}): no dated matches found.`,
          }),
        );
        continue;
      }

      const times = dates.map((d) => d.getTime());
      const earliest = new Date(Math.min(...times));
      const spanDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;
      const type = spanDays <= CUP_MAX_SPAN_DAYS ? 'cup' : 'season';

      const { eraName, eraId } = this.resolveEraId(
        earliest,
        eras,
        eraIdsByName,
      );
      if (eraId === undefined) {
        const message =
          eraName === undefined
            ? `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${earliest.toISOString().slice(0, 10)} falls in no configured era.`
            : `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${earliest.toISOString().slice(0, 10)} falls in the configured era "${eraName}", which has no known database id (its rules set may have failed to import).`;
        errors.push(
          makeImportError({
            item: competition,
            message,
          }),
        );
        continue;
      }

      const success = await this.competitionsImport.upsertCompetition(
        {
          name: competition.name,
          type,
          eraId,
          externalIds: [
            { externalSystemId: bblSystemId, externalId: competition.bblId },
            { externalSystemId: nameSystemId, externalId: competition.name },
          ],
        },
        errors,
      );
      if (success) {
        imported += 1;
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }

  /**
   * Read every competition's match dates in a single pass over the ma pages.
   * Only the season-sorted variant (`so=s`) is keyed by competition id; the
   * `&gr=` group-filter variant is a byte-identical duplicate, so the first
   * page seen per `s` wins. Per-page parse failures are recorded and skipped.
   */
  private async collectMatchDates(
    errors: ImportError[],
  ): Promise<Map<string, Date[]>> {
    const datesByCompetitionId = new Map<string, Date[]>();
    for await (const page of this.sourceReader.pages(MATCH_LIST_PAGE_TYPE)) {
      const competitionId = page.params.s;
      if (
        page.params.so !== MATCH_LIST_SORT_BY_SEASON ||
        competitionId === undefined ||
        datesByCompetitionId.has(competitionId)
      ) {
        continue;
      }
      try {
        datesByCompetitionId.set(
          competitionId,
          this.matchListPageParser.extractMatchDates(page),
        );
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
    return datesByCompetitionId;
  }

  /**
   * Read the master competition list off the first se page (or, failing that,
   * the first sr page) — both embed the identical dropdown. Returns null when
   * neither page type exists, or when the page that was found fails to parse
   * (the failure is recorded as an error).
   */
  private async readCompetitionList(
    errors: ImportError[],
  ): Promise<BblCompetition[] | null> {
    for (const type of [PLAYED_LIST_PAGE_TYPE, STANDINGS_LIST_PAGE_TYPE]) {
      for await (const page of this.sourceReader.pages(type)) {
        try {
          return this.competitionListPageParser.extractCompetitions(page);
        } catch (error) {
          errors.push(
            makeImportError({
              item: { page: page.params },
              message: `Failed to parse master competition list page ${JSON.stringify(page.params)}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
          return null;
        }
      }
    }
    return null;
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
    const day = date.toISOString().slice(0, 10);
    for (const era of eras) {
      if (
        day >= era.startDate &&
        (era.endDate === undefined || day < era.endDate)
      ) {
        return { eraName: era.name, eraId: eraIdsByName.get(era.name) };
      }
    }
    return { eraName: undefined, eraId: undefined };
  }
}
