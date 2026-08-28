import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { TournamentParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { LeagueConfigService } from '../leagues/league-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
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
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly tournamentParser: TournamentParserService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly leagueConfig: LeagueConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import the configured eras, each referencing its league and its rule
   * sets. Both are resolved server-side, by external id, against whatever the
   * leagues and rules-sets steps upserted moments earlier in the same run --
   * one batched lookup per kind for the whole run, not one per era. Each era
   * is keyed by its name under both the TP and Name external systems. Eras
   * whose league or a rule set does not resolve are skipped with a recorded
   * error.
   *
   * Additionally cross-checks TP's opaque numeric rule-set code: every base
   * tournament file under one era's directory should report the same code. A
   * mismatch (or an unparseable tournament file) records a diagnostic error but
   * the era is still upserted, since config-driven identity is authoritative.
   * Idempotent.
   */
  async importEras(): Promise<{
    result: ImportResult;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const tpSystemName = this.externalSystemName.getTpSystemName();

    let eras: EraDataConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let leagueName: string;
    try {
      leagueName = this.leagueConfig.getLeagueName();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { eras: eras.map((e) => e.name) },
          message:
            'Cannot import eras: the league name could not be read from ' +
            `configuration: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }
    const leagueRef = { externalSystemId: tpSystemId, externalId: leagueName };
    const leagueIds = await this.lookup.lookupMap('league', [leagueRef]);
    const leagueId = leagueIds.get(this.lookup.keyOf(leagueRef));

    const rulesSetIds = await this.lookup.lookupMap(
      'rulesSet',
      [...new Set(eras.flatMap((era) => era.rulesSets))].map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

    if (leagueId === undefined) {
      errors.push(
        this.importResults.error({
          item: { eras: eras.map((e) => e.name) },
          message:
            'Cannot import eras: the league could not be resolved, so its id ' +
            'is unknown.',
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }

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
      const resolved = this.resolveRulesSetIds(era, rulesSetIds, tpSystemId);
      if (resolved.errors.length > 0) {
        errors.push(...resolved.errors);
        continue;
      }

      this.checkRuleSetConsistency(era, scan, errors);

      const upsertedEra = await this.erasImport.upsert(
        {
          name: era.name,
          leagueId,
          rulesSetIds: resolved.ids,
          startDate: era.startDate,
          endDate: era.endDate,
          externalIds: [
            { externalSystemId: tpSystemId, externalId: era.name },
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forEra(era.name),
            },
          ],
        },
        errors,
      );
      if (upsertedEra) {
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
    };
  }

  /**
   * Resolve each configured rule-set name to its imported id. Returns the id
   * list plus any errors (an unresolved name yields one error and no ids).
   */
  private resolveRulesSetIds(
    era: EraDataConfig,
    rulesSetIds: Map<string, number>,
    tpSystemId: number,
  ): { ids: number[]; errors: ImportError[] } {
    const ids: number[] = [];
    for (const name of era.rulesSets) {
      const id = rulesSetIds.get(
        this.lookup.keyOf({ externalSystemId: tpSystemId, externalId: name }),
      );
      if (id === undefined) {
        return {
          ids: [],
          errors: [
            this.importResults.error({
              item: era,
              message: `Cannot import era "${era.name}": its rule set "${name}" could not be resolved.`,
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
