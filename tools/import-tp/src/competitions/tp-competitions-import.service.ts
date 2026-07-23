import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpTournament } from '@blood-bowl-tracker/parse-tp';
import {
  MatchParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import {
  isBaseTournamentFile,
  TpSourceReader,
} from '../source/tp-source-reader';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
  eraIdsByName: Map<string, number>;
  systemIds: { tp: number; name: number };
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
    private readonly nameExternalId: NameExternalIdService,
  ) {}

  /**
   * Import every competition found under the configured era directories. A
   * competition is one `<era>/<competition>` subdirectory: its base
   * `tournament_<slug>.json` gives its name and TP id; its `match_*.json`
   * files give the dates whose span classifies it (span <= 3 days => cup, else
   * season). Its era is the directory's own era, looked up in `eraIdsByName`
   * (produced by TpErasImportService) — no date-range matching is needed,
   * unlike BBL. Each competition is keyed by its numeric TP id (stringified)
   * under the TP external system and by its exact name under Name.
   * Competitions with no base tournament file, an unparsable one, no dated
   * matches, or an era with no known id are skipped with a recorded error.
   * Idempotent.
   *
   * Also returns `competitionIdsByTpId` (each imported competition's TP id to
   * its DB id), `matchesByCompetitionId` (each imported competition's DB id to
   * every TpMatch parsed for it during this scan) and `competitionsByTpId`
   * (each imported competition's TP id to the exact UpsertCompetition object
   * built for it, plus its era/competition directory strings). Match files
   * carry no tournament id, so matchesByCompetitionId is the only association
   * between a match and its competition; TpMatchesImportService consumes it to
   * set each match's competitionId (mirroring BBL's competitionIdsByBblId).
   * competitionsByTpId is consumed by TpTeamParticipationImportService to
   * re-upsert each competition with its teamEraIds (competition_teams) — the
   * UpsertCompetition is needed in full because UpsertCompetitionSchema has no
   * partial update, and the directory strings match the competition's rosters.
   */
  async importCompetitions(eraIdsByName: Map<string, number>): Promise<{
    result: ImportResult;
    competitionIdsByTpId: Map<number, number>;
    matchesByCompetitionId: Map<number, TpMatch[]>;
    competitionsByTpId: Map<
      number,
      { upsert: UpsertCompetition; era: string; competition: string }
    >;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const competitionIdsByTpId = new Map<number, number>();
    const matchesByCompetitionId = new Map<number, TpMatch[]>();
    const competitionsByTpId = new Map<
      number,
      { upsert: UpsertCompetition; era: string; competition: string }
    >();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        competitionIdsByTpId,
        matchesByCompetitionId,
        competitionsByTpId,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    const groups = await this.collectGroups(errors);
    for (const group of groups.values()) {
      const upserted = await this.importGroup({
        group,
        eraIdsByName,
        systemIds: { tp: tpSystemId, name: nameSystemId },
        errors,
      });
      if (upserted !== undefined) {
        competitionIdsByTpId.set(upserted.tpId, upserted.id);
        competitionsByTpId.set(upserted.tpId, {
          upsert: upserted.upsert,
          era: group.era,
          competition: group.competition,
        });
        // Accumulate rather than overwrite: two distinct TP tournament
        // directories could in principle dedupe onto the same DB competition
        // (e.g. a Name-external-id collision), and losing the earlier
        // group's matches in that case would be a silent data-loss bug.
        matchesByCompetitionId.set(upserted.id, [
          ...(matchesByCompetitionId.get(upserted.id) ?? []),
          ...group.matches,
        ]);
        imported += 1;
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      competitionIdsByTpId,
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
        if (file.type === 'tournament' && isBaseTournamentFile(file.filename)) {
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
        makeImportError({
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
        makeImportError({
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
   * on success (for competitionIdsByTpId).
   */
  private async importGroup({
    group,
    eraIdsByName,
    systemIds,
    errors,
  }: ImportGroupOptions): Promise<
    { id: number; tpId: number; upsert: UpsertCompetition } | undefined
  > {
    const location = `${group.era}/${group.competition}`;

    if (group.tournamentContent === undefined) {
      errors.push(
        makeImportError({
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
        makeImportError({
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
        makeImportError({
          item: tournament,
          message:
            `Skipping competition "${tournament.name}" in "${location}": ` +
            'no dated matches found.',
        }),
      );
      return undefined;
    }

    const eraId = eraIdsByName.get(group.era);
    if (eraId === undefined) {
      errors.push(
        makeImportError({
          item: tournament,
          message:
            `Skipping competition "${tournament.name}" in "${location}": its ` +
            `era "${group.era}" has no known database id — the era may have ` +
            'failed to import.',
        }),
      );
      return undefined;
    }

    const competitionData: UpsertCompetition = {
      name: tournament.name,
      type: this.classifyType(group.matches.map((m) => m.playedDate)),
      eraId,
      teamEraIds: [],
      externalIds: [
        { externalSystemId: systemIds.tp, externalId: String(tournament.id) },
        {
          externalSystemId: systemIds.name,
          externalId: this.nameExternalId.forCompetition(tournament.name),
        },
      ],
    };
    const upserted = await this.competitionsImport.upsertCompetitionResult(
      competitionData,
      errors,
    );
    if (upserted === undefined) {
      return undefined;
    }
    return { id: upserted.id, tpId: tournament.id, upsert: competitionData };
  }

  /** span <= 3 days => cup, else season (see CUP_MAX_SPAN_DAYS). */
  private classifyType(matchDates: Date[]): 'season' | 'cup' {
    const times = matchDates.map((d) => d.getTime());
    const spanDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;
    return spanDays <= CUP_MAX_SPAN_DAYS ? 'cup' : 'season';
  }
}
