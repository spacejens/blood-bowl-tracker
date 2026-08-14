import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ManualDataReader } from '../data-file/manual-data-reader.service';
import { CoachesProcessor } from '../entities/coaches.processor';
import { CompetitionGroupsProcessor } from '../entities/competition-groups.processor';
import { CompetitionsProcessor } from '../entities/competitions.processor';
import { ErasProcessor } from '../entities/eras.processor';
import { ExternalSystemsProcessor } from '../entities/external-systems.processor';
import { LeaguesProcessor } from '../entities/leagues.processor';
import { PositionsProcessor } from '../entities/positions.processor';
import { RacesProcessor } from '../entities/races.processor';
import { RulesSetsProcessor } from '../entities/rules-sets.processor';
import { SppAwardValuesProcessor } from '../entities/spp-award-values.processor';
import { TeamsProcessor } from '../entities/teams.processor';
import { TrophiesProcessor } from '../entities/trophies.processor';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';

@Injectable()
export class ManualImportService {
  constructor(
    private readonly reader: ManualDataReader,
    private readonly externalSystems: ExternalSystemsProcessor,
    private readonly rulesSets: RulesSetsProcessor,
    private readonly leagues: LeaguesProcessor,
    private readonly eras: ErasProcessor,
    private readonly races: RacesProcessor,
    private readonly positions: PositionsProcessor,
    private readonly coaches: CoachesProcessor,
    private readonly teams: TeamsProcessor,
    private readonly competitionGroups: CompetitionGroupsProcessor,
    private readonly competitions: CompetitionsProcessor,
    private readonly sppAwardValues: SppAwardValuesProcessor,
    private readonly trophies: TrophiesProcessor,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Read and pool every `.json5` file in `dir`, bootstrap the external systems
   * it references, then process each entity section in dependency order —
   * rulesSets, leagues, eras, races, positions, coaches, teams,
   * competitionGroups, competitions, sppAwardValues, trophies — with
   * competitionGroups running after leagues (whose external ids its entries
   * reference) and before competitions and trophies (which resolve the group
   * names it publishes into ctx.competitionGroupIds), and sppAwardValues
   * running before trophies because it references both rulesSets and races,
   * and trophies running last because it references nothing, so its position
   * in the order is free — sharing one ExternalIdMap and error collector
   * so cross-references resolve and one bad entry never aborts the rest.
   * Reference-resolution and upsert failures are collected; a missing
   * directory, malformed file, or unreachable API throws out of here to be
   * reported as an unexpected failure.
   */
  async run(dir: string): Promise<ImportResult> {
    const data = await this.reader.read(dir);
    const systemIds = await this.externalSystems.bootstrap(data);

    const errors: ImportError[] = [];
    const ctx: ProcessContext = {
      data,
      systemIds,
      idMap: new ExternalIdMap(),
      competitionGroupIds: new Map(),
      errors,
    };

    let imported = 0;
    imported += await this.rulesSets.process(ctx);
    imported += await this.leagues.process(ctx);
    imported += await this.eras.process(ctx);
    imported += await this.races.process(ctx);
    imported += await this.positions.process(ctx);
    imported += await this.coaches.process(ctx);
    imported += await this.teams.process(ctx);
    imported += await this.competitionGroups.process(ctx);
    imported += await this.competitions.process(ctx);
    imported += await this.sppAwardValues.process(ctx);
    imported += await this.trophies.process(ctx);

    return this.importResults.result({ imported, errors });
  }
}
