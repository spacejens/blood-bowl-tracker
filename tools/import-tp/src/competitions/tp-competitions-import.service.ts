import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchDateRangeService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpTournament } from '@blood-bowl-tracker/parse-tp';
import {
  MatchParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpSourceReader } from '../source/tp-source-reader';

// (max - min) match-date span <= 3 days => cup, else season. Mirrors BBL's
// CUP_MAX_SPAN_DAYS in bbl-competitions-import.service.ts; validated against
// all 12 TP reference competitions (see the design doc's Background section).
const CUP_MAX_SPAN_DAYS = 3;

/** One competition's files, accumulated during the single streaming pass. */
interface CompetitionGroup {
  era: string;
  competition: string;
  tournamentContent?: unknown;
  matches: TpMatch[];
}

interface ImportGroupOptions {
  group: CompetitionGroup;
  eraIds: Map<string, number>;
  systemIds: { tp: number };
  errors: ImportError[];
}

interface AddMatchOptions {
  group: CompetitionGroup;
  filename: string;
  content: unknown;
  errors: ImportError[];
}

@Injectable()
export class TpCompetitionsImportService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly tournamentParser: TournamentParserService,
    private readonly matchParser: MatchParserService,
    private readonly competitionsImport: CompetitionsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly dateRange: MatchDateRangeService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import every competition found under the configured era directories. A
   * competition is one `<era>/<competition>` subdirectory: its base
   * `tournament_<slug>.json` gives its name and TP id; its `match_*.json`
   * files give the dates whose span classifies it (span <= 3 days => cup, else
   * season). Its era is the directory's own era, resolved server-side, by
   * external id, against whatever TpErasImportService upserted moments
   * earlier in the same run (one batched lookup for the whole run, not one
   * per competition) — no date-range matching is needed, unlike BBL. Each
   * competition is keyed by its numeric TP id (stringified) under the TP
   * external system.
   * Competitions with no base tournament file, an unparsable one, no dated
   * matches, or an era with no known id are skipped with a recorded error.
   * Idempotent.
   *
   * Also returns `matchesByCompetitionId` (each imported competition's DB id
   * to every TpMatch parsed for it during this scan) and `competitionsByTpId`
   * (each imported competition's TP id to the exact UpsertCompetition object
   * built for it, plus its era/competition directory strings). Match files
   * carry no tournament id, so matchesByCompetitionId is the only association
   * between a match and its competition; TpMatchesImportService consumes it to
   * set each match's competitionId (mirroring BBL's competitionIdsByBblId).
   * competitionsByTpId is consumed by TpTeamParticipationImportService to
   * re-upsert each competition with its teamEraIds (competition_teams) — the
   * UpsertCompetition is needed in full because UpsertCompetitionSchema has no
   * partial update, and the directory strings match the competition's rosters.
   * A caller that needs a competition's DB id resolves it itself, server-side,
   * by external id (its TP id, stringified, under `competitionsByTpId`'s own
   * `upsert.externalIds[0].externalSystemId`) via `ReferenceLookupService`.
   */
  async importCompetitions(): Promise<{
    result: ImportResult;
    matchesByCompetitionId: Map<number, TpMatch[]>;
    competitionsByTpId: Map<
      number,
      {
        upsert: UpsertCompetition;
        era: string;
        competition: string;
        // The group the competition is classified into, read off the
        // upsert's own response rather than the payload: import-tp never
        // sets it (the classification is curated in tools/import-manual's
        // before-other-importers phase), so the response is the only place
        // it appears. Consumed by TpTrophyAwardsImportService, which needs
        // the group's curated name to resolve a trophy.
        //
        // This value is always a real classification:
        // `competitions.competition_group_id` is NOT NULL with no database
        // default, so a competition this importer had to create without a
        // curated group never reaches this map — its upsert fails with a
        // per-record error instead.
        competitionGroupId: number;
      }
    >;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const matchesByCompetitionId = new Map<number, TpMatch[]>();
    const competitionsByTpId = new Map<
      number,
      {
        upsert: UpsertCompetition;
        era: string;
        competition: string;
        competitionGroupId: number;
      }
    >();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        matchesByCompetitionId,
        competitionsByTpId,
      };
    }
    const [tpSystemId] = bootstrap.ids;

    let eraNames: string[];
    try {
      eraNames = [
        ...new Set(this.eraDataConfig.getEras().map((era) => era.name)),
      ];
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        matchesByCompetitionId,
        competitionsByTpId,
      };
    }
    const eraIds = await this.lookup.lookupMap(
      'era',
      eraNames.map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

    const groups = await this.collectGroups(errors);
    for (const group of groups.values()) {
      const upserted = await this.importGroup({
        group,
        eraIds,
        systemIds: { tp: tpSystemId },
        errors,
      });
      if (upserted !== undefined) {
        competitionsByTpId.set(upserted.tpId, {
          upsert: upserted.upsert,
          era: group.era,
          competition: group.competition,
          competitionGroupId: upserted.competitionGroupId,
        });
        // Accumulate rather than overwrite: two distinct TP tournament
        // directories could in principle dedupe onto the same DB competition
        // (e.g. two directories carrying the same TP tournament id), and
        // losing the earlier group's matches would be a silent data-loss bug.
        matchesByCompetitionId.set(upserted.id, [
          ...(matchesByCompetitionId.get(upserted.id) ?? []),
          ...group.matches,
        ]);
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      matchesByCompetitionId,
      competitionsByTpId,
    };
  }

  /**
   * Single streaming pass over every source file, grouped by
   * `${era}::${competition}`. Base tournament files supply each group's
   * tournamentContent; match files are parsed and their resolved dates pushed
   * onto matchDates (a match parse failure is recorded but does not abort).
   * A throw from files() (e.g. a missing era directory) is recorded and the
   * groups collected so far are returned — mirroring how TpErasImportService's
   * rule-set scan records its throw and continues.
   */
  private async collectGroups(
    errors: ImportError[],
  ): Promise<Map<string, CompetitionGroup>> {
    const groups = new Map<string, CompetitionGroup>();
    try {
      for await (const file of this.sourceReader.files()) {
        const key = `${file.era}::${file.competition}`;
        const group = groups.get(key) ?? {
          era: file.era,
          competition: file.competition,
          matches: [],
        };
        if (
          file.type === 'tournament' &&
          this.sourceReader.isBaseTournamentFile(file.filename)
        ) {
          group.tournamentContent = file.content;
        } else if (file.type === 'match') {
          this.addMatch({
            group,
            filename: file.filename,
            content: file.content,
            errors,
          });
        }
        groups.set(key, group);
      }
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: 'competition files' },
          message:
            'Could not complete the competition file scan: ' +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
    return groups;
  }

  /** Parse one match file onto the group, recording a parse failure. */
  private addMatch({
    group,
    filename,
    content,
    errors,
  }: AddMatchOptions): void {
    try {
      const match = this.matchParser.parse(content);
      group.matches.push(match);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { era: group.era, competition: group.competition, filename },
          message:
            `Could not parse match file "${filename}" in ` +
            `"${group.era}/${group.competition}": ` +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
  }

  /**
   * Validate one group into an UpsertCompetition and upsert it, or record a
   * skip error and return undefined. Returns the competition's TP id and DB id
   * on success (for competitionsByTpId).
   */
  private async importGroup({
    group,
    eraIds,
    systemIds,
    errors,
  }: ImportGroupOptions): Promise<
    | {
        id: number;
        tpId: number;
        upsert: UpsertCompetition;
        competitionGroupId: number;
      }
    | undefined
  > {
    const location = `${group.era}/${group.competition}`;

    if (group.tournamentContent === undefined) {
      errors.push(
        this.importResults.error({
          item: { era: group.era, competition: group.competition },
          message:
            `Skipping competition in "${location}": no base tournament file ` +
            '(tournament_<slug>.json) was found.',
        }),
      );
      return undefined;
    }

    let tournament: TpTournament;
    try {
      tournament = this.tournamentParser.parse(group.tournamentContent);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { era: group.era, competition: group.competition },
          message:
            `Skipping competition in "${location}": ` +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return undefined;
    }

    if (group.matches.length === 0) {
      errors.push(
        this.importResults.error({
          item: tournament,
          message:
            `Skipping competition "${tournament.name}" in "${location}": ` +
            'no dated matches found.',
        }),
      );
      return undefined;
    }

    const eraId = eraIds.get(
      this.lookup.keyOf({
        externalSystemId: systemIds.tp,
        externalId: group.era,
      }),
    );
    if (eraId === undefined) {
      errors.push(
        this.importResults.error({
          item: tournament,
          message:
            `Skipping competition "${tournament.name}" in "${location}": its ` +
            `era "${group.era}" has no known database id — the era may not ` +
            'be imported yet.',
        }),
      );
      return undefined;
    }

    const range = this.dateRange.computeRange(
      group.matches.map((m) => m.playedDate),
    );
    const competitionData: UpsertCompetition = {
      name: tournament.name,
      type: this.classifyType(range.spanDays),
      eraId,
      startDate: this.toIsoDay(range.earliestDate),
      endDate: this.toIsoDay(range.latestDate),
      teamEraIds: [],
      externalIds: [
        { externalSystemId: systemIds.tp, externalId: String(tournament.id) },
      ],
    };
    const upserted = await this.competitionsImport.upsertCompetitionResult(
      competitionData,
      errors,
    );
    if (upserted === undefined) {
      return undefined;
    }
    return {
      id: upserted.id,
      tpId: tournament.id,
      upsert: competitionData,
      competitionGroupId: upserted.competitionGroupId,
    };
  }

  /** span <= 3 days => cup, else season (see CUP_MAX_SPAN_DAYS). */
  private classifyType(spanDays: number): 'season' | 'cup' {
    return spanDays <= CUP_MAX_SPAN_DAYS ? 'cup' : 'season';
  }

  /** A Date as the ISO `YYYY-MM-DD` day string the API contract expects. */
  private toIsoDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
