import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionGroupsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { BblCompetitionEntry } from '../competitions/bbl-competitions-import.service';
import { BblCompetitionTrophyReaderService } from '../matches/bbl-competition-trophy-reader.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

export interface ImportBblTrophyAwardsOptions {
  competitionsByBblId: Map<string, BblCompetitionEntry>;
  teamEraIdsByCompetitionBblId: Map<string, Map<string, number>>;
  playerIdsByPid: Map<string, number>;
  teamEraIdsByPid: Map<string, number>;
}

/**
 * State that lives for the whole import run, shared across every
 * competition: the trophy-key memoization cache, the BBL external system id
 * keys resolve against, the curated group names by id and the batch-resolved
 * competition DB ids.
 */
interface RunContext {
  trophyIdsByKey: Map<string, number | undefined>;
  bblSystemId: number;
  groupNamesById: Map<number, string>;
  competitionIds: Map<string, number>;
  /**
   * Count, per group-scoped key already known to be unresolvable, of further
   * award rows that referenced it and were dropped without their own error
   * (since TrophiesImportService only records the resolution failure once,
   * the first time the key is seen).
   */
  droppedRowCountsByKey: Map<string, number>;
}

/**
 * Everything one competition's award rows need, gathered once so the two row
 * loops stay within the 3-parameter limit. Nests the run-scoped context
 * rather than duplicating its fields. `groupName` is the competition's
 * curated competition-group name, which scopes trophy resolution (issue
 * #520).
 */
interface CompetitionContext {
  competitionId: number;
  groupName: string;
  teamEraIdsByCode: Map<string, number>;
  run: RunContext;
}

@Injectable()
export class BblTrophyAwardsImportService {
  constructor(
    private readonly trophyReader: BblCompetitionTrophyReaderService,
    private readonly trophiesImport: TrophiesImportService,
    private readonly trophyAwardsImport: TrophyAwardsImportService,
    private readonly competitionGroupsImport: CompetitionGroupsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Record every trophy and player award BBL's competition results pages
   * (`p=sr`) list.
   *
   * A trophy is *resolved*, never created: the upsert carries only a
   * `tloeg.bbleague.se` external id, which matches the curated catalog seeded
   * by tools/import-manual. An id the catalog does not know cannot satisfy
   * `trophies`' NOT NULL columns, so the call fails and is recorded as a skip
   * rather than inventing a trophy. The id tried first is the competition's
   * group-scoped composite `${label}-${groupName}`, falling back to the bare
   * label (issue #520) — see `resolveTrophyId`. Resolutions are memoized per
   * run under `${label}::${groupName}` — successes and failures alike — so a
   * bad key is reported once, not once per row, and the same label in two
   * different groups is never conflated.
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

    const groups =
      await this.competitionGroupsImport.listCompetitionGroups(errors);
    if (groups === undefined) {
      return { result: this.importResults.result({ imported, errors }) };
    }

    // One round trip for the whole run: every competition referenced here was
    // upserted moments ago by the preceding competitions step, so it is
    // already in the database and resolvable by its BBL id.
    const competitionIds = await this.lookup.lookupMap(
      'competition',
      [...options.competitionsByBblId].map(([bblId, entry]) => ({
        externalSystemId: entry.upsert.externalIds[0].externalSystemId,
        externalId: bblId,
      })),
    );

    const rowsByCompetitionId =
      await this.trophyReader.getRowsByCompetitionId(errors);
    const runContext: RunContext = {
      trophyIdsByKey: new Map<string, number | undefined>(),
      bblSystemId,
      groupNamesById: new Map(groups.map((group) => [group.id, group.name])),
      competitionIds,
      droppedRowCountsByKey: new Map<string, number>(),
    };

    for (const [competitionBblId, rows] of rowsByCompetitionId) {
      const context = this.buildContext(
        {
          competitionBblId,
          entry: options.competitionsByBblId.get(competitionBblId),
          teamEraIdsByCode:
            options.teamEraIdsByCompetitionBblId.get(competitionBblId) ??
            new Map<string, number>(),
          run: runContext,
        },
        errors,
      );
      if (context === undefined) {
        continue;
      }

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

    for (const [key, droppedCount] of runContext.droppedRowCountsByKey) {
      errors.push(
        this.importResults.error({
          item: { trophy: key },
          message:
            `Skipped ${droppedCount} further award row(s) referencing the ` +
            `"${key}" trophy key: it could not be resolved (see the ` +
            `earlier error for this key).`,
        }),
      );
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * Everything this competition's award rows need, or `undefined` after
   * recording why they must all be skipped: the competition was not
   * imported, it was not pre-seeded by curated data (so its group id cannot
   * be trusted), or its group is not in the curated catalog. Mirrors
   * TpTrophyAwardsImportService.buildContext, including its
   * freshly-created guard.
   */
  private buildContext(
    options: {
      competitionBblId: string;
      entry: BblCompetitionEntry | undefined;
      teamEraIdsByCode: Map<string, number>;
      run: RunContext;
    },
    errors: ImportError[],
  ): CompetitionContext | undefined {
    const { competitionBblId, entry, run } = options;
    const competitionId =
      entry === undefined
        ? undefined
        : run.competitionIds.get(
            this.lookup.keyOf({
              externalSystemId: entry.upsert.externalIds[0].externalSystemId,
              externalId: competitionBblId,
            }),
          );
    if (entry === undefined || competitionId === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: competitionBblId },
          message: `Skipping trophy awards for competition id ${competitionBblId}: it was not imported.`,
        }),
      );
      return undefined;
    }
    // A competition this importer had to create fresh (rather than matching
    // an existing curated row) was not pre-seeded by tools/import-manual's
    // before-other-importers phase, so its competitionGroupId is whatever
    // competitions.competition_group_id's schema default happens to be, not
    // a real classification -- checked before groupName resolution so such a
    // competition never reaches trophy resolution regardless of which group
    // id it landed on.
    if (entry.created) {
      errors.push(
        this.importResults.error({
          item: { competition: competitionBblId },
          message:
            `Skipping trophy awards for competition id ${competitionBblId}: ` +
            'it was not pre-seeded by curated data, so its competition group ' +
            'cannot be trusted as a real classification.',
        }),
      );
      return undefined;
    }
    const groupName = run.groupNamesById.get(entry.competitionGroupId);
    if (groupName === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: competitionBblId },
          message:
            `Skipping trophy awards for competition id ${competitionBblId}: ` +
            `its competition group ${entry.competitionGroupId} is not in the ` +
            'curated competition-group catalog.',
        }),
      );
      return undefined;
    }
    return {
      competitionId,
      groupName,
      teamEraIdsByCode: options.teamEraIdsByCode,
      run,
    };
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
   * The catalog trophy this label refers to *in this competition's group*, or
   * `undefined` when it cannot be resolved (in which case
   * TrophiesImportService has already recorded the failure on `errors`).
   *
   * Two external ids are tried, in order (issue #520):
   *   1. `${label}-${groupName}` — the composite id the curated catalog uses
   *      for a player-trophy label BBL awards in more than one competition
   *      group, matching the format TP's own ids already use.
   *   2. the bare `label` — the original scheme, which every
   *      self-disambiguating team trophy (`Major 1st`, `Minor 1st`) and every
   *      unambiguous player trophy still uses.
   *
   * The composite attempt gets its own throwaway `errors` array: a failed
   * lookup there is the *expected* outcome for every trophy that has no
   * group-scoped row, and letting TrophiesImportService record it on the run's
   * real error list would report a spurious failure for almost every award.
   * Only the fallback's failure is a real one, so only it writes to `errors`.
   * A bare-label fallback that resolves the *wrong* group's trophy is not
   * silently accepted either: the server-side group check in
   * TrophyAwardsService rejects that award at write time.
   *
   * Memoized per run under `${label}::${groupName}`, failures included, so
   * the same label in two different groups no longer shares one cache entry.
   * Every row after the first that hits an already-known-bad key is counted
   * in `context.run.droppedRowCountsByKey` rather than reported individually,
   * so the caller can add one summary error per key once the run ends.
   */
  private async resolveTrophyId(
    label: string,
    context: CompetitionContext,
    errors: ImportError[],
  ): Promise<number | undefined> {
    const { run } = context;
    const key = `${label}::${context.groupName}`;
    if (run.trophyIdsByKey.has(key)) {
      const memoized = run.trophyIdsByKey.get(key);
      if (memoized === undefined) {
        run.droppedRowCountsByKey.set(
          key,
          (run.droppedRowCountsByKey.get(key) ?? 0) + 1,
        );
      }
      return memoized;
    }

    const composite = await this.trophiesImport.upsertTrophy(
      {
        externalIds: [
          {
            externalSystemId: run.bblSystemId,
            externalId: `${label}-${context.groupName}`,
          },
        ],
      },
      // Deliberately discarded -- see this method's doc comment.
      [],
    );
    let trophyId = composite?.id;
    if (trophyId === undefined) {
      const fallback = await this.trophiesImport.upsertTrophy(
        {
          externalIds: [
            { externalSystemId: run.bblSystemId, externalId: label },
          ],
        },
        errors,
      );
      trophyId = fallback?.id;
    }

    run.trophyIdsByKey.set(key, trophyId);
    return trophyId;
  }
}
