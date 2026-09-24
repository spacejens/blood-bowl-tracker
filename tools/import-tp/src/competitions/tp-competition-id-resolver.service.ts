import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** Options for {@link TpCompetitionIdResolverService.resolveCompetitionIds}. */
export interface ResolveCompetitionIdsOptions {
  /** TP ids of the competitions this run imported. */
  tpIds: readonly number[];
  /**
   * The TP external system's database id; undefined when it could not be
   * set up, which the competition scan has already reported.
   */
  tpSystemId: number | undefined;
}

export interface ResolveCompetitionIdsResult {
  result: ImportResult;
  /** Each imported competition's TP id to its database id. */
  competitionIdsByTpId: Map<number, number>;
}

/**
 * Resolves every competition this run imported to its database id,
 * server-side by external id (its TP id, stringified): one batched lookup for
 * the whole run, reused to link each match file to its competition and to
 * scope the missing-trophy-awards pass. A competition whose id fails to
 * resolve is recorded as an `ImportError` and omitted, rather than silently
 * leaving its matches and trophies unimported.
 */
@Injectable()
export class TpCompetitionIdResolverService {
  constructor(
    private readonly lookup: ReferenceLookupService,
    private readonly importResults: ImportResultService,
  ) {}

  async resolveCompetitionIds({
    tpIds,
    tpSystemId,
  }: ResolveCompetitionIdsOptions): Promise<ResolveCompetitionIdsResult> {
    const errors: ImportError[] = [];
    const competitionIdsByTpId = new Map<number, number>();
    if (tpSystemId !== undefined && tpIds.length > 0) {
      const refs = tpIds.map((tpId) => ({
        tpId,
        ref: { externalSystemId: tpSystemId, externalId: String(tpId) },
      }));
      const resolved = await this.lookup.lookupMap(
        'competition',
        refs.map(({ ref }) => ref),
      );
      for (const { tpId, ref } of refs) {
        const competitionId = resolved.get(this.lookup.keyOf(ref));
        if (competitionId === undefined) {
          errors.push(
            this.importResults.error({
              item: { competition: tpId },
              message: `Could not resolve competition id ${tpId} to a database id: its match files and missing trophy awards will be skipped.`,
            }),
          );
          continue;
        }
        competitionIdsByTpId.set(tpId, competitionId);
      }
    }
    // imported: 0 because this only resolves ids; the competition import step
    // already counted the competitions it imported.
    return {
      result: this.importResults.result({ imported: 0, errors }),
      competitionIdsByTpId,
    };
  }
}
