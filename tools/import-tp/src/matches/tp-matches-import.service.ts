import type { UpsertMatch } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportResult,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

@Injectable()
export class TpMatchesImportService {
  constructor(
    private readonly matchesImport: MatchesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every match parsed during competitions import. The input map (from
   * TpCompetitionsImportService.importCompetitions) is keyed by DB competition
   * id — the only association between a match and its competition, since match
   * files carry no tournament id — and each match is upserted under the TP
   * external system keyed by its stringified match id. Matches carry NO Name
   * external id: their names are not unique, so (per
   * docs/game-concepts/matches/index.md) a name must never be an external id.
   * Team-era linkage and match events are out of scope (teamEraIds: []). A
   * single match's upsert failure is recorded (by the shared import runner) and
   * does not abort the rest. This service does no file I/O or parsing.
   * Idempotent.
   */
  async importMatches(
    matchesByCompetitionId: Map<number, TpMatch[]>,
  ): Promise<{ result: ImportResult; matchIdsByTpId: Map<number, number> }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const matchIdsByTpId = new Map<number, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, isBookkeeping: false },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        matchIdsByTpId,
      };
    }
    const [tpSystemId] = bootstrap.ids;

    for (const [competitionId, matches] of matchesByCompetitionId) {
      for (const match of matches) {
        const data: UpsertMatch = {
          competitionId,
          playedAt: match.playedDate,
          name: match.name,
          externalIds: [
            { externalSystemId: tpSystemId, externalId: String(match.id) },
          ],
          teamEraIds: [],
        };
        const upserted = await this.matchesImport.upsertMatchResult(
          data,
          errors,
        );
        if (upserted) {
          imported += 1;
          matchIdsByTpId.set(match.id, upserted.id);
        }
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      matchIdsByTpId,
    };
  }
}
