import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblCompetitionTrophyReaderService } from '../matches/bbl-competition-trophy-reader.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

export interface ImportBblTrophyAwardsOptions {
  competitionsByBblId: Map<string, UpsertCompetition>;
  teamEraIdsByCompetitionBblId: Map<string, Map<string, number>>;
  playerIdsByPid: Map<string, number>;
  teamEraIdsByPid: Map<string, number>;
}

/**
 * State that lives for the whole import run, shared across every
 * competition: the trophy-label memoization cache and the BBL external
 * system id used to resolve labels against it.
 */
interface RunContext {
  trophyIdsByLabel: Map<string, number | undefined>;
  bblSystemId: number;
  /**
   * Count, per label already known to be unresolvable, of further award rows
   * that referenced it and were dropped without their own error (since
   * TrophiesImportService only records the resolution failure once, the
   * first time the label is seen).
   */
  droppedRowCountsByLabel: Map<string, number>;
}

/**
 * Everything one competition's award rows need, gathered once so the two row
 * loops stay within the 3-parameter limit. Nests the run-scoped context
 * rather than duplicating its fields.
 */
interface CompetitionContext {
  competitionId: number;
  teamEraIdsByCode: Map<string, number>;
  run: RunContext;
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
    private readonly lookup: ReferenceLookupService,
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

    // One round trip for the whole run: every competition referenced here was
    // upserted moments ago by the preceding competitions step, so it is
    // already in the database and resolvable by its BBL id.
    const competitionIds = await this.lookup.lookupMap(
      'competition',
      [...options.competitionsByBblId].map(([bblId, competition]) => ({
        externalSystemId: competition.externalIds[0].externalSystemId,
        externalId: bblId,
      })),
    );

    const rowsByCompetitionId =
      await this.trophyReader.getRowsByCompetitionId(errors);
    const runContext: RunContext = {
      trophyIdsByLabel: new Map<string, number | undefined>(),
      bblSystemId,
      droppedRowCountsByLabel: new Map<string, number>(),
    };

    for (const [competitionBblId, rows] of rowsByCompetitionId) {
      const competition = options.competitionsByBblId.get(competitionBblId);
      const competitionId = competition
        ? competitionIds.get(
            this.lookup.keyOf({
              externalSystemId: competition.externalIds[0].externalSystemId,
              externalId: competitionBblId,
            }),
          )
        : undefined;
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
        run: runContext,
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
        const awarded = await this.writeAward(
          { label: row.label, teamEraId, playerId: null, context },
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
        const awarded = await this.writeAward(
          { label: row.label, teamEraId, playerId, context },
          errors,
        );
        if (awarded) {
          imported += 1;
        }
      }
    }

    for (const [label, droppedCount] of runContext.droppedRowCountsByLabel) {
      errors.push(
        this.importResults.error({
          item: { trophy: label },
          message:
            `Skipped ${droppedCount} further award row(s) referencing the ` +
            `"${label}" trophy label: it could not be resolved (see the ` +
            `earlier error for this label).`,
        }),
      );
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * Resolve `label` to a trophy id and, if that succeeds, write the award
   * (team award when `playerId` is `null`, player award otherwise). Returns
   * whether an award was actually written and should count toward
   * `imported`, so both row loops share this one code path.
   */
  private async writeAward(
    options: {
      label: string;
      teamEraId: number;
      playerId: number | null;
      context: CompetitionContext;
    },
    errors: ImportError[],
  ): Promise<boolean> {
    const trophyId = await this.resolveTrophyId(
      options.label,
      options.context,
      errors,
    );
    if (trophyId === undefined) {
      return false;
    }
    const awarded = await this.trophyAwardsImport.upsertTrophyAward(
      {
        trophyId,
        competitionId: options.context.competitionId,
        teamEraId: options.teamEraId,
        playerId: options.playerId,
      },
      errors,
    );
    return Boolean(awarded);
  }

  /**
   * The catalog trophy whose BBL external id is this exact label, or
   * `undefined` when it cannot be resolved (in which case
   * TrophiesImportService has already recorded the failure on `errors`).
   * Memoized per run, including failures. Every row after the first that
   * hits an already-known-bad label is counted in
   * `context.run.droppedRowCountsByLabel` rather than reported individually,
   * so the caller can add one summary error per label once the run ends.
   */
  private async resolveTrophyId(
    label: string,
    context: CompetitionContext,
    errors: ImportError[],
  ): Promise<number | undefined> {
    if (context.run.trophyIdsByLabel.has(label)) {
      const trophyId = context.run.trophyIdsByLabel.get(label);
      if (trophyId === undefined) {
        const { droppedRowCountsByLabel } = context.run;
        droppedRowCountsByLabel.set(
          label,
          (droppedRowCountsByLabel.get(label) ?? 0) + 1,
        );
      }
      return trophyId;
    }
    const trophy = await this.trophiesImport.upsertTrophy(
      {
        externalIds: [
          { externalSystemId: context.run.bblSystemId, externalId: label },
        ],
      },
      errors,
    );
    const trophyId = trophy?.id;
    context.run.trophyIdsByLabel.set(label, trophyId);
    return trophyId;
  }
}
