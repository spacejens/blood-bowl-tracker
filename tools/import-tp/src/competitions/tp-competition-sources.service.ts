import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
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

/** One valid competition directory, ready to import. */
export interface TpCompetitionSource {
  tournament: TpTournament;
  /** The era directory's name: the era's name, and its TP external id. */
  era: string;
  /** The competition directory's name. */
  competition: string;
  /** The era's database id. */
  eraId: number;
}

/** What {@link TpCompetitionSourcesService.collect} found. */
export interface CollectedCompetitionSources {
  /** Scan, parse and validation failures; the collector imports nothing. */
  result: ImportResult;
  /** The TP external system's database id; undefined when it could not be set up. */
  tpSystemId: number | undefined;
  /** Each valid competition directory, by its tournament's TP id. */
  competitionsByTpId: Map<number, TpCompetitionSource>;
  /** Every parsed match, by its competition's TP id. */
  matchesByCompetitionTpId: Map<number, TpMatch[]>;
}

/** One competition's files, accumulated during the single streaming pass. */
interface CompetitionGroup {
  era: string;
  competition: string;
  tournamentContent?: unknown;
  matches: TpMatch[];
}

interface ValidateGroupOptions {
  group: CompetitionGroup;
  eraIds: Map<string, number>;
  tpSystemId: number;
  errors: ImportError[];
}

interface AddMatchOptions {
  group: CompetitionGroup;
  filename: string;
  content: unknown;
  errors: ImportError[];
}

@Injectable()
export class TpCompetitionSourcesService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly tournamentParser: TournamentParserService,
    private readonly matchParser: MatchParserService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Scans every competition directory once, before anything else is
   * imported. TP's match files carry no tournament id, so the directory is
   * the only association between a match and its competition. The parsed
   * matches feed the roster and hired-star steps long before the
   * competitions themselves are imported, by TpCompetitionsImportService,
   * after the rosters. Writes nothing but the TP external system.
   */
  async collect(): Promise<CollectedCompetitionSources> {
    const errors: ImportError[] = [];
    const competitionsByTpId = new Map<number, TpCompetitionSource>();
    const matchesByCompetitionTpId = new Map<number, TpMatch[]>();
    const collected = (
      tpSystemId: number | undefined,
    ): CollectedCompetitionSources => ({
      result: this.importResults.result({ imported: 0, errors }),
      tpSystemId,
      competitionsByTpId,
      matchesByCompetitionTpId,
    });

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return collected(undefined);
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
      return collected(tpSystemId);
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
      const source = this.validateGroup({ group, eraIds, tpSystemId, errors });
      if (source === undefined) {
        continue;
      }
      const tpId = source.tournament.id;
      competitionsByTpId.set(tpId, source);
      // Accumulate rather than overwrite: two directories carrying the same
      // TP tournament id would otherwise silently lose the earlier one's
      // matches.
      matchesByCompetitionTpId.set(tpId, [
        ...(matchesByCompetitionTpId.get(tpId) ?? []),
        ...group.matches,
      ]);
    }
    return collected(tpSystemId);
  }

  /**
   * Single streaming pass over every source file, grouped by
   * `${era}::${competition}`. Base tournament files supply each group's
   * tournamentContent, and match files are parsed onto the group (a match
   * parse failure is recorded but does not abort). A throw from files()
   * (e.g. a missing era directory) is recorded and the groups collected so
   * far are returned.
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
      group.matches.push(this.matchParser.parse(content));
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
   * Validate one group into a competition source, or record a skip error and
   * return undefined. The group needs a parsable base tournament file, at
   * least one dated match, and an era with a known database id.
   */
  private validateGroup({
    group,
    eraIds,
    tpSystemId,
    errors,
  }: ValidateGroupOptions): TpCompetitionSource | undefined {
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
        externalSystemId: tpSystemId,
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
    return {
      tournament,
      era: group.era,
      competition: group.competition,
      eraId,
    };
  }
}
