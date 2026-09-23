import type { ImportError, RulesSet } from '@blood-bowl-tracker/api-contract';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import {
  ErasService,
  ExternalSystemsService,
  RulesSetsService,
} from '@blood-bowl-tracker/game-data';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** What every upsert of one roster import needs, resolved once up front. */
export interface TpRosterContext {
  tpSystemId: number;
  nameSystemId: number;
  era: { id: number; name: string };
  /**
   * The era's single rules set, or undefined when it declares none or
   * several (already reported). Characteristics, lasting-injury reductions
   * and characteristic increases are then skipped for every player; the
   * rest of the import is unaffected.
   */
  rulesSet: RulesSet | undefined;
}

/** Options for {@link TpRosterContextService.resolve}. */
export interface ResolveRosterContextOptions {
  roster: TpRoster;
  /** The era's name, which is also its TP external id. */
  era: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  errors: ImportError[];
}

@Injectable()
export class TpRosterContextService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly eras: ErasService,
    private readonly rulesSets: RulesSetsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts TP's and the Name bookkeeping external systems, resolves the
   * era by its TP external id, and reads the rules set the era declares from
   * the database. Characteristics are per rules set, and TP's own numeric
   * `ruleSet` field has no established name mapping, so the era's declared
   * rules set is the only reliable source. An external-system failure or an
   * unknown era records one error and resolves nothing; an era declaring
   * anything other than exactly one rules set records one error and
   * resolves with no rules set.
   */
  async resolve({
    roster,
    era,
    externalSystemName,
    errors,
  }: ResolveRosterContextOptions): Promise<TpRosterContext | undefined> {
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

    const eraRef = await this.eras.resolve({
      externalSystemId: systemIds.tpSystemId,
      externalId: era,
    });
    if (!eraRef.found) {
      errors.push(
        this.importResults.error({
          item: { era, roster: roster.id },
          message: `Unknown era "${era}" for roster ${roster.id}: not found among imported eras.`,
        }),
      );
      return undefined;
    }

    return {
      ...systemIds,
      era: { id: eraRef.id, name: era },
      rulesSet: await this.singleRulesSet({
        eraId: eraRef.id,
        eraName: era,
        errors,
      }),
    };
  }

  private async singleRulesSet(options: {
    eraId: number;
    eraName: string;
    errors: ImportError[];
  }): Promise<RulesSet | undefined> {
    const { eraId, eraName, errors } = options;
    const declared = await this.rulesSets.listByEra(eraId);
    if (declared.length === 1) {
      return declared[0];
    }
    const names = declared.map((rulesSet) => rulesSet.name);
    errors.push(
      this.importResults.error({
        item: { era: eraName, rulesSets: names },
        message:
          `Era "${eraName}" declares ${names.length} rules sets ` +
          `(${names.join(', ')}); characteristics need exactly ` +
          'one, so they are skipped for every roster in this era.',
      }),
    );
    return undefined;
  }
}
