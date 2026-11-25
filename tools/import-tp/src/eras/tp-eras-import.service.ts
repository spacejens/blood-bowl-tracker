import type { Era } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
  TP_EXTERNAL_SYSTEM,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { TournamentParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpSourceReader } from '../source/tp-source-reader';
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
    private readonly tournamentParser: TournamentParserService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Attach the TP external id to every configured era (league.eras). The era
   * itself is curated (batch 001), league, dates and rules sets included:
   * this step finds it by its Name external id and adds the same name under
   * the TP system, sending nothing else. An era missing from the catalog
   * fails with the server's missing-field error, recorded for that era.
   *
   * Returns every upserted era keyed by its configured name. The upsert
   * answers with the curated era, so the rules-sets step reads its rules-set
   * names from this map instead of from the config.
   *
   * Additionally cross-checks TP's opaque numeric rule-set code: every base
   * tournament file under one era's directory should report the same code. A
   * mismatch (or an unparseable tournament file) records a diagnostic error but
   * the era is still upserted, since the curated identity is authoritative.
   * Idempotent.
   */
  async importEras(): Promise<{
    result: ImportResult;
    erasByName: Map<string, Era>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const erasByName = new Map<string, Era>();

    let eras: EraDataConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: {
            externalSystems: [
              TP_EXTERNAL_SYSTEM_NAME,
              NAME_EXTERNAL_SYSTEM_NAME,
            ],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        erasByName,
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      TP_EXTERNAL_SYSTEM,
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        erasByName,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let scan: RuleSetScan;
    try {
      scan = await this.scanRuleSetCodes();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { eras: eras.map((e) => e.name) },
          message:
            'Could not complete the rule-set-code consistency scan across ' +
            `era tournament files: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      scan = { codesByEra: new Map(), parseErrorByEra: new Map() };
    }

    for (const era of eras) {
      this.checkRuleSetConsistency(era, scan, errors);

      const upsertedEra = await this.erasImport.upsert(
        {
          // The contract's default, spelled out because the upsert type
          // requires it: an empty list links no rules set and leaves the
          // curated era's links alone.
          rulesSetIds: [],
          externalIds: [
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forEra(era.name),
            },
            { externalSystemId: tpSystemId, externalId: era.name },
          ],
        },
        errors,
      );
      if (upsertedEra) {
        imported += 1;
        erasByName.set(era.name, upsertedEra);
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      erasByName,
    };
  }

  /**
   * Stream every base tournament file once, grouping the distinct rule-set
   * codes seen under each era's directory and recording a parse failure per era.
   */
  private async scanRuleSetCodes(): Promise<RuleSetScan> {
    const codesByEra = new Map<string, Set<number>>();
    const parseErrorByEra = new Map<string, string[]>();
    for await (const file of this.sourceReader.files()) {
      if (
        file.type !== 'tournament' ||
        !this.sourceReader.isBaseTournamentFile(file.filename)
      ) {
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
        this.importResults.error({
          item: era,
          message: `Era "${era.name}": ${parseErrors.length} tournament file(s) could not be parsed for the rule-set consistency check (${parseErrors.join('; ')}).`,
        }),
      );
    }
    const codes = scan.codesByEra.get(era.name);
    if (codes !== undefined && codes.size > 1) {
      errors.push(
        this.importResults.error({
          item: era,
          message: `Era "${era.name}": tournaments report differing TP rule-set codes (${[...codes].sort((a, b) => a - b).join(', ')}); a tournament may live under the wrong era subdirectory.`,
        }),
      );
    }
  }
}
