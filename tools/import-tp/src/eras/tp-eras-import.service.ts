import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { TournamentParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import {
  isBaseTournamentFile,
  TpSourceReader,
} from '../source/tp-source-reader';
import { EraDataConfig, EraDataConfigService } from './era-data-config.service';

/** Rule-set codes and parse failures seen while scanning tournament files. */
interface RuleSetScan {
  codesByEra: Map<string, Set<number>>;
  parseErrorByEra: Map<string, string[]>;
}

@Injectable()
export class TpErasImportService {
  constructor(
    private readonly eraConfig: EraDataConfigService,
    private readonly erasImport: ErasImportService,
    private readonly sourceReader: TpSourceReader,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly tournamentParser: TournamentParserService,
  ) {}

  /**
   * Import the configured eras, each referencing the league id and its rule
   * set ids (both resolved earlier in the run and passed in). Each era is keyed
   * by its name under both the TP and Name external systems. Eras whose league
   * id or rule set id is unknown are skipped with a recorded error.
   *
   * Additionally cross-checks TP's opaque numeric rule-set code: every base
   * tournament file under one era's directory should report the same code. A
   * mismatch (or an unparseable tournament file) records a diagnostic error but
   * the era is still upserted, since config-driven identity is authoritative.
   * Idempotent.
   */
  async importEras(
    leagueId: number | undefined,
    rulesSetIdsByName: Map<string, number>,
  ): Promise<{ result: ImportResult; eraIdsByName: Map<string, number> }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const eraIdsByName = new Map<string, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();

    let eras: EraDataConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        makeImportError({
          item: { externalSystems: [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, isBookkeeping: false },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    if (leagueId === undefined) {
      errors.push(
        makeImportError({
          item: { eras: eras.map((e) => e.name) },
          message:
            'Cannot import eras: the league was not imported successfully, so ' +
            'its id is unknown.',
        }),
      );
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }

    let scan: RuleSetScan;
    try {
      scan = await this.scanRuleSetCodes();
    } catch (error) {
      errors.push(
        makeImportError({
          item: { eras: eras.map((e) => e.name) },
          message:
            'Could not complete the rule-set-code consistency scan across ' +
            `era tournament files: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      scan = { codesByEra: new Map(), parseErrorByEra: new Map() };
    }

    for (const era of eras) {
      const resolved = this.resolveRulesSetIds(era, rulesSetIdsByName);
      if (resolved.errors.length > 0) {
        errors.push(...resolved.errors);
        continue;
      }

      this.checkRuleSetConsistency(era, scan, errors);

      const upsertedEra = await this.erasImport.upsertEra(
        {
          name: era.name,
          leagueId,
          rulesSetIds: resolved.ids,
          startDate: era.startDate,
          endDate: era.endDate,
          externalIds: [
            { externalSystemId: tpSystemId, externalId: era.name },
            { externalSystemId: nameSystemId, externalId: era.name },
          ],
        },
        errors,
      );
      if (upsertedEra) {
        eraIdsByName.set(era.name, upsertedEra.id);
        imported += 1;
      }
    }

    return { result: makeImportResult({ imported, errors }), eraIdsByName };
  }

  /**
   * Resolve each configured rule-set name to its imported id. Returns the id
   * list plus any errors (an unresolved name yields one error and no ids).
   */
  private resolveRulesSetIds(
    era: EraDataConfig,
    rulesSetIdsByName: Map<string, number>,
  ): { ids: number[]; errors: ImportError[] } {
    const ids: number[] = [];
    for (const name of era.rulesSets) {
      const id = rulesSetIdsByName.get(name);
      if (id === undefined) {
        return {
          ids: [],
          errors: [
            makeImportError({
              item: era,
              message: `Cannot import era "${era.name}": its rule set "${name}" was not imported successfully.`,
            }),
          ],
        };
      }
      ids.push(id);
    }
    return { ids, errors: [] };
  }

  /**
   * Stream every base tournament file once, grouping the distinct rule-set
   * codes seen under each era's directory and recording a parse failure per era.
   */
  private async scanRuleSetCodes(): Promise<RuleSetScan> {
    const codesByEra = new Map<string, Set<number>>();
    const parseErrorByEra = new Map<string, string[]>();
    for await (const file of this.sourceReader.files()) {
      if (file.type !== 'tournament' || !isBaseTournamentFile(file.filename)) {
        continue;
      }
      try {
        const tournament = this.tournamentParser.parse(file.content);
        const codes = codesByEra.get(file.era) ?? new Set<number>();
        codes.add(tournament.ruleSet);
        codesByEra.set(file.era, codes);
      } catch (error) {
        const parseErrors = parseErrorByEra.get(file.era) ?? [];
        parseErrors.push(
          `${file.filename}: ${error instanceof Error ? error.message : String(error)}`,
        );
        parseErrorByEra.set(file.era, parseErrors);
      }
    }
    return { codesByEra, parseErrorByEra };
  }

  /**
   * Record a diagnostic error if this era's tournament files disagree on the
   * rule-set code, or if any of them failed to parse. Never blocks the upsert.
   */
  private checkRuleSetConsistency(
    era: EraDataConfig,
    scan: RuleSetScan,
    errors: ImportError[],
  ): void {
    const parseErrors = scan.parseErrorByEra.get(era.name);
    if (parseErrors !== undefined && parseErrors.length > 0) {
      errors.push(
        makeImportError({
          item: era,
          message: `Era "${era.name}": ${parseErrors.length} tournament file(s) could not be parsed for the rule-set consistency check (${parseErrors.join('; ')}).`,
        }),
      );
    }
    const codes = scan.codesByEra.get(era.name);
    if (codes !== undefined && codes.size > 1) {
      errors.push(
        makeImportError({
          item: era,
          message: `Era "${era.name}": tournaments report differing TP rule-set codes (${[...codes].sort((a, b) => a - b).join(', ')}); a tournament may live under the wrong era subdirectory.`,
        }),
      );
    }
  }
}
