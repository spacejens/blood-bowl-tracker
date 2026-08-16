import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblCompetitionTrophyReaderService } from '../matches/bbl-competition-trophy-reader.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

export interface ImportBblTrophyAwardsOptions {
  competitionIdsByBblId: Map<string, number>;
  teamEraIdsByCompetitionBblId: Map<string, Map<string, number>>;
  playerIdsByPid: Map<string, number>;
  teamEraIdsByPid: Map<string, number>;
}

/**
 * Everything one competition's award rows need, gathered once so the two row
 * loops stay within the 3-parameter limit.
 */
interface CompetitionContext {
  competitionId: number;
  teamEraIdsByCode: Map<string, number>;
  trophyIdsByLabel: Map<string, number | undefined>;
  bblSystemId: number;
}

@Injectable()
export class BblTrophyAwardsImportService {
  constructor(
    private readonly trophyReader: BblCompetitionTrophyReaderService,
    private readonly trophiesImport: TrophiesImportService,
    private readonly trophyAwardsImport: TrophyAwardsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Record every trophy and player award BBL's competition results pages
   * (`p=sr`) list.
   *
   * A trophy is *resolved*, never created: the upsert carries only the row's
   * exact BBL label as a `tloeg.bbleague.se` external id, which matches the
   * curated catalog seeded by tools/import-manual. A label the catalog does
   * not know cannot satisfy `trophies`' NOT NULL columns, so the call fails
   * and is recorded as a skip rather than inventing a trophy. Resolutions are
   * memoized per run — successes and failures alike — so a bad label is
   * reported once, not once per row.
   *
   * Ties are not special-cased: BBL lists one row per tied winner (up to four
   * in the real data) and each becomes its own award row. No cutoff.
   *
   * Every unresolvable row (unknown competition, team code, pid or label) is
   * recorded as an error and skipped, matching every other BBL importer.
   */
  async importTrophyAwards(
    options: ImportBblTrophyAwardsOptions,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [
        {
          name: this.externalSystemName.getBblSystemName(),
          category: 'imported_data_source',
        },
      ],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [bblSystemId] = bootstrap.ids;

    const rowsByCompetitionId =
      await this.trophyReader.getRowsByCompetitionId(errors);
    const trophyIdsByLabel = new Map<string, number | undefined>();

    for (const [competitionBblId, rows] of rowsByCompetitionId) {
      const competitionId = options.competitionIdsByBblId.get(competitionBblId);
      if (competitionId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: competitionBblId },
            message: `Skipping trophy awards for competition id ${competitionBblId}: it was not imported.`,
          }),
        );
        continue;
      }

      const context: CompetitionContext = {
        competitionId,
        teamEraIdsByCode:
          options.teamEraIdsByCompetitionBblId.get(competitionBblId) ??
          new Map<string, number>(),
        trophyIdsByLabel,
        bblSystemId,
      };

      for (const row of rows.teamTrophies) {
        const teamEraId = context.teamEraIdsByCode.get(row.teamCode);
        if (teamEraId === undefined) {
          errors.push(
            this.importResults.error({
              item: { competition: competitionBblId, trophy: row.label },
              message:
                `Skipping the "${row.label}" award in competition ` +
                `${competitionBblId}: could not resolve team code ` +
                `"${row.teamCode}" to a team era in its competition.`,
            }),
          );
          continue;
        }
        const trophyId = await this.resolveTrophyId(row.label, context, errors);
        if (trophyId === undefined) {
          continue;
        }
        const awarded = await this.trophyAwardsImport.upsertTrophyAward(
          {
            trophyId,
            competitionId: context.competitionId,
            teamEraId,
            playerId: null,
          },
          errors,
        );
        if (awarded) {
          imported += 1;
        }
      }

      for (const row of rows.playerPrizes) {
        const playerId = options.playerIdsByPid.get(row.pid);
        const teamEraId = options.teamEraIdsByPid.get(row.pid);
        if (playerId === undefined || teamEraId === undefined) {
          errors.push(
            this.importResults.error({
              item: { competition: competitionBblId, trophy: row.label },
              message:
                `Skipping the "${row.label}" award in competition ` +
                `${competitionBblId}: player "${row.pid}" was not imported.`,
            }),
          );
          continue;
        }
        const trophyId = await this.resolveTrophyId(row.label, context, errors);
        if (trophyId === undefined) {
          continue;
        }
        const awarded = await this.trophyAwardsImport.upsertTrophyAward(
          {
            trophyId,
            competitionId: context.competitionId,
            teamEraId,
            playerId,
          },
          errors,
        );
        if (awarded) {
          imported += 1;
        }
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * The catalog trophy whose BBL external id is this exact label, or
   * `undefined` when it cannot be resolved (in which case
   * TrophiesImportService has already recorded the failure on `errors`).
   * Memoized per run, including failures.
   */
  private async resolveTrophyId(
    label: string,
    context: CompetitionContext,
    errors: ImportError[],
  ): Promise<number | undefined> {
    if (context.trophyIdsByLabel.has(label)) {
      return context.trophyIdsByLabel.get(label);
    }
    const trophy = await this.trophiesImport.upsertTrophy(
      {
        externalIds: [
          { externalSystemId: context.bblSystemId, externalId: label },
        ],
      },
      errors,
    );
    const trophyId = trophy?.id;
    context.trophyIdsByLabel.set(label, trophyId);
    return trophyId;
  }
}
