import type {
  ImportError,
  ImportResult,
  UpsertCompetitionData,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfig, EraConfigService } from '../eras/era-config.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import {
  BblCompetition,
  CompetitionListPageParser,
} from './competition-list-page-parser';

const PLAYED_LIST_PAGE_TYPE = 'se';
const STANDINGS_LIST_PAGE_TYPE = 'sr';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// (latest - earliest) <= 3 days => cup, else season. Validated against all 74
// competitions in the mirror (see the competitions design doc); do not change.
const CUP_MAX_SPAN_DAYS = 3;

@Injectable()
export class BblCompetitionsImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly competitionListPageParser: CompetitionListPageParser,
    private readonly matchListReader: BblMatchListReaderService,
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
   *
   * Also returns `competitionIdsByBblId`, mapping each imported competition's
   * BBL id to its DB id — `UpsertCompetitionData` (used for
   * `competitionsByBblId`) carries no DB id, but matches need one to set their
   * `competitionId`.
   */
  async importCompetitions(eraIdsByName: Map<string, number>): Promise<{
    result: ImportResult;
    competitionsByBblId: Map<string, UpsertCompetitionData>;
    competitionIdsByBblId: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const competitionsByBblId = new Map<string, UpsertCompetitionData>();
    const competitionIdsByBblId = new Map<string, number>();

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
      return {
        result: makeImportResult({ imported, errors }),
        competitionsByBblId,
        competitionIdsByBblId,
      };
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
      return {
        result: makeImportResult({ imported, errors }),
        competitionsByBblId,
        competitionIdsByBblId,
      };
    }

    for (const competition of competitions) {
      const resolved = this.resolveTypeAndEra(
        competition,
        datesByCompetitionId.get(competition.bblId) ?? [],
        eras,
        eraIdsByName,
        errors,
      );
      if (resolved === undefined) {
        continue;
      }

      const competitionData: UpsertCompetitionData = {
        name: competition.name,
        type: resolved.type,
        eraId: resolved.eraId,
        teamEraIds: [],
        externalIds: [
          { externalSystemId: bblSystemId, externalId: competition.bblId },
          { externalSystemId: nameSystemId, externalId: competition.name },
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
      result: makeImportResult({ imported, errors }),
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
   * Resolve a competition's type and era DB id, or return undefined after
   * recording a skip error. A competition whose bblId is listed in an era's
   * seasonCompetitionIdOverrides is hard-assigned that era with type 'season';
   * one listed in cupCompetitionIdOverrides is hard-assigned that era with
   * type 'cup'. Either override applies unconditionally and ahead of any
   * match-date resolution (mirroring how playerIdOverrides pins a player to
   * an era) — this is the only path for a competition with a genuinely empty
   * match list. Otherwise the era and type are derived from the match dates:
   * no dates => skip; span <= 3 days => cup, else season; earliest date
   * matched against the configured era ranges.
   */
  private resolveTypeAndEra(
    competition: BblCompetition,
    dates: Date[],
    eras: EraConfig[],
    eraIdsByName: Map<string, number>,
    errors: ImportError[],
  ): { type: 'season' | 'cup'; eraId: number } | undefined {
    const seasonOverrideEra = eras.find((era) =>
      era.seasonCompetitionIdOverrides?.includes(competition.bblId),
    );
    const cupOverrideEra = eras.find((era) =>
      era.cupCompetitionIdOverrides?.includes(competition.bblId),
    );
    const overrideEra = seasonOverrideEra ?? cupOverrideEra;
    if (overrideEra !== undefined) {
      const overrideType = seasonOverrideEra !== undefined ? 'season' : 'cup';
      const eraId = eraIdsByName.get(overrideEra.name);
      if (eraId === undefined) {
        errors.push(
          makeImportError({
            item: competition,
            message: `Skipping competition "${competition.name}" (id ${competition.bblId}): its configured era override "${overrideEra.name}" has no known database id (its rules set may have failed to import).`,
          }),
        );
        return undefined;
      }
      return { type: overrideType, eraId };
    }

    if (dates.length === 0) {
      errors.push(
        makeImportError({
          item: competition,
          message: `Skipping competition "${competition.name}" (id ${competition.bblId}): no dated matches found.`,
        }),
      );
      return undefined;
    }

    const times = dates.map((d) => d.getTime());
    const earliest = new Date(Math.min(...times));
    const spanDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;
    const type = spanDays <= CUP_MAX_SPAN_DAYS ? 'cup' : 'season';

    const { eraName, eraId } = this.resolveEraId(earliest, eras, eraIdsByName);
    if (eraId === undefined) {
      const message =
        eraName === undefined
          ? `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${earliest.toISOString().slice(0, 10)} falls in no configured era.`
          : `Skipping competition "${competition.name}" (id ${competition.bblId}): its earliest match date ${earliest.toISOString().slice(0, 10)} falls in the configured era "${eraName}", which has no known database id (its rules set may have failed to import).`;
      errors.push(makeImportError({ item: competition, message }));
      return undefined;
    }

    return { type, eraId };
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
