import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** One imported competition, as TpCompetitionsImportService reports it. */
interface CompetitionEntry {
  upsert: UpsertCompetition;
  era: string;
  competition: string;
  competitionGroupId: number;
  created: boolean;
}

export interface ResolveCompetitionIdsOptions {
  competitionsByTpId: Map<number, CompetitionEntry>;
}

export interface ResolveCompetitionIdsResult {
  result: ImportResult;
  /** Each competition's TP id to its resolved database id. */
  competitionIdsByTpId: Map<number, number>;
  /** Each competition's database id to its cup/season type. */
  competitionTypesByCompetitionId: Map<number, 'season' | 'cup'>;
  /** Each competition's database id to the era it belongs to. */
  eraIdByCompetitionId: Map<number, number>;
}

/**
 * Resolves every competition TpCompetitionsImportService just imported to
 * its database id, server-side by external id (its TP id, stringified) --
 * one batched lookup for the whole run, reused both for match category
 * classification and for hired-star era resolution -- and derives the two
 * small maps `main.ts` threads onward from that same resolved id:
 * `competitionTypesByCompetitionId` and `eraIdByCompetitionId`.
 *
 * A competition whose id fails to resolve is recorded as an `ImportError`
 * and omitted from every map here, mirroring how
 * `TpTrophyAwardsImportService` handles the identical kind of miss --
 * silently dropping it, as this logic used to when it lived inline in
 * `main.ts`, would leave match category classification, hired-star era
 * resolution, match events and match outcomes quietly missing data with no
 * indication in the run's reported result.
 */
@Injectable()
export class TpCompetitionIdResolverService {
  constructor(
    private readonly lookup: ReferenceLookupService,
    private readonly importResults: ImportResultService,
  ) {}

  async resolveCompetitionIds(
    options: ResolveCompetitionIdsOptions,
  ): Promise<ResolveCompetitionIdsResult> {
    const { competitionsByTpId } = options;
    const errors: ImportError[] = [];
    const competitionIdsByTpId = new Map<number, number>();
    const competitionTypesByCompetitionId = new Map<number, 'season' | 'cup'>();
    const eraIdByCompetitionId = new Map<number, number>();

    const resolved = await this.lookup.lookupMap(
      'competition',
      [...competitionsByTpId].map(([tpId, entry]) => ({
        externalSystemId: entry.upsert.externalIds[0].externalSystemId,
        externalId: String(tpId),
      })),
    );

    for (const [tpId, entry] of competitionsByTpId) {
      const competitionId = resolved.get(
        this.lookup.keyOf({
          externalSystemId: entry.upsert.externalIds[0].externalSystemId,
          externalId: String(tpId),
        }),
      );
      if (competitionId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: tpId },
            message:
              `Could not resolve competition id ${tpId} to a database id: ` +
              'match category classification, hired-star era resolution, ' +
              'match events and match outcomes for it will be skipped.',
          }),
        );
        continue;
      }
      competitionIdsByTpId.set(tpId, competitionId);

      if (entry.upsert.type !== undefined) {
        competitionTypesByCompetitionId.set(competitionId, entry.upsert.type);
      }

      // UpsertCompetitionSchema.eraId is optional to support partial-upsert
      // payloads from other callers, but TpCompetitionsImportService always
      // resolves eraId from the era name before building this upsert --
      // skipping and recording an error otherwise -- so every entry reaching
      // this loop has one.
      const { eraId } = entry.upsert;
      if (eraId === undefined) {
        throw new Error(
          `Competition "${entry.upsert.name}" has no eraId; import-tp always resolves eraId before building its upsert.`,
        );
      }
      eraIdByCompetitionId.set(competitionId, eraId);
    }

    return {
      // imported: 0 -- this service resolves already-imported competitions'
      // ids for downstream use; it does not import anything new itself, so
      // it must not add to the run's "imported" total (TpCompetitionsImportService
      // already counted these competitions as imported when it upserted
      // them). Mirrors the rosterCollectionResult precedent in main.ts.
      result: this.importResults.result({ imported: 0, errors }),
      competitionIdsByTpId,
      competitionTypesByCompetitionId,
      eraIdByCompetitionId,
    };
  }
}
