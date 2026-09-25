import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import {
  ErasService,
  ExternalSystemsService,
  RulesSetsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** What every write of one rules set's official team list needs, resolved once. */
export interface TpOfficialTeamsContext {
  tpSystemId: number;
  nameSystemId: number;
  /** The rules set's name, which is also its TP external id. */
  rulesSet: string;
  rulesSetId: number;
  /**
   * Every era declaring this rules set that was imported from TP: the eras a
   * race or position on this list becomes available in. Empty (already
   * reported) when there is none.
   */
  eraIds: number[];
}

/** Options for {@link TpOfficialTeamsContextService.resolve}. */
export interface ResolveOfficialTeamsContextOptions {
  rulesSet: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  errors: ImportError[];
}

@Injectable()
export class TpOfficialTeamsContextService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly rulesSets: RulesSetsService,
    private readonly eras: ErasService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts TP's and the Name bookkeeping external systems, resolves the
   * rules set by its TP external id (its name) and lists the TP eras that
   * declare it. TP's official list carries no era: which eras a race or
   * position is available in is whichever of this league's eras play under
   * the rules set. An external-system failure, an unknown rules set or an
   * unreadable era list records one error and resolves nothing; a rules set
   * no TP era declares records one error and resolves with no eras, so the
   * list is still imported, just without availability.
   */
  async resolve({
    rulesSet,
    externalSystemName,
    errors,
  }: ResolveOfficialTeamsContextOptions): Promise<
    TpOfficialTeamsContext | undefined
  > {
    const systemIds = await this.runner.record({
      run: async () => {
        const tp = await this.externalSystems.upsert({
          name: externalSystemName,
          category: 'imported_data_source',
        });
        const name = await this.externalSystems.upsert(NAME_EXTERNAL_SYSTEM);
        return { tpSystemId: tp.system.id, nameSystemId: name.system.id };
      },
      item: {
        externalSystems: [externalSystemName, NAME_EXTERNAL_SYSTEM.name],
      },
      errors,
      buildErrorMessage: (error) => this.runner.messageOf(error),
    });
    if (systemIds === undefined) {
      return undefined;
    }

    const rulesSetRef = await this.rulesSets.resolve({
      externalSystemId: systemIds.tpSystemId,
      externalId: rulesSet,
    });
    if (!rulesSetRef.found) {
      errors.push(
        this.importResults.error({
          item: { rulesSet },
          message: `Skipping TP's official team list for rules set "${rulesSet}": the rules set has not been imported.`,
        }),
      );
      return undefined;
    }

    const eras = await this.runner.record({
      run: () =>
        this.eras.listByRulesSetAndExternalSystem({
          rulesSetId: rulesSetRef.id,
          externalSystemId: systemIds.tpSystemId,
        }),
      item: { rulesSet },
      errors,
      buildErrorMessage: (error) =>
        `Failed to read the eras of rules set "${rulesSet}": ${this.runner.messageOf(error)}`,
    });
    if (eras === undefined) {
      return undefined;
    }
    if (eras.length === 0) {
      errors.push(
        this.importResults.error({
          item: { rulesSet },
          message: `Rules set "${rulesSet}" is declared by no era imported from ${externalSystemName}; its races and positions are imported without era availability.`,
        }),
      );
    }

    return {
      ...systemIds,
      rulesSet,
      rulesSetId: rulesSetRef.id,
      eraIds: eras.map((era) => era.id),
    };
  }
}
