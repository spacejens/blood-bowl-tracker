import { contract } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionGroupsService,
  ExternalSystemsService,
  MatchOutcomesService,
  PositionRulesSetFormatMismatchError,
  PositionsService,
  SppAdjustmentsService,
  SppAwardValuesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { implement } from '@orpc/server';

import type { UpsertHandlerService } from './upsert-handler.service';

/**
 * Route-building for procedures that are fully hand-written forever — they
 * never use any of RpcRouterFactoryService's generic route builders, in this
 * task or any later one, either because the whole entity is non-standard
 * (sppAwardValues, trophyAwards, externalSystems) or because the procedure
 * is a one-off extra alongside an otherwise-standard entity (e.g.
 * positions.syncRaceEras). Pulled out of rpc-router-factory.service.ts (as
 * opposed to the generic builder methods themselves) purely to keep that
 * file under its 500-line ESLint cap; the WHY-hand-written rationale in each
 * comment below is unchanged from when it lived there. This fits CLAUDE.md's
 * "Service vs. loose function" exemption 2 — pure assembly wrapped by a
 * factory service — the same pattern as `buildFactTree`/`FactTreeFactoryService`:
 * each function here is pure declarative assembly of a route object, invoked
 * only from `RpcRouterFactoryService.build()`, itself a thin `@Injectable()`
 * factory that supplies the real, already-injected dependencies once.
 */

// sppAwardValues: not routed through the upsert handler. Award values are
// keyed by (rulesSetId, raceId, actionType) rather than external ids, so
// there is no CONFLICT error to map and no entity+created shape to return —
// same shape as positions.syncRaceEras.
export function buildSppAwardValuesRoutes(
  sppAwardValuesService: SppAwardValuesService,
) {
  return {
    sync: implement(contract.sppAwardValues.sync).handler(({ input }) =>
      sppAwardValuesService.sync(input),
    ),
  };
}

// trophyAwards: only `upsert`, matching the contract — award rows are few
// enough that batching buys nothing. No conflict class: `trophy_awards` has
// a database unique constraint on its natural key, so the dedup lookup can
// never match more than one row. `runWithoutConflict` still maps a
// recipient-kind mismatch to BAD_REQUEST.
export function buildTrophyAwardsRoutes(
  upsertHandler: UpsertHandlerService,
  trophyAwardsService: TrophyAwardsService,
) {
  return {
    upsert: implement(contract.trophyAwards.upsert).handler(
      ({ input, errors }) =>
        upsertHandler.runWithoutConflict(errors, async () => {
          const { trophyAward, created } =
            await trophyAwardsService.upsert(input);
          return { entity: trophyAward, created };
        }),
    ),
  };
}

// externalSystems: the only upsert with no CONFLICT error in the contract —
// an external system is looked up and matched by its name alone (see
// ExternalSystemsService.upsert), so there is no ambiguity between multiple
// existing rows for it to catch. Hand-written rather than run through the
// upsert handler so the absence is deliberate and visible.
export function buildExternalSystemsRoutes(
  upsertHandler: UpsertHandlerService,
  externalSystemsService: ExternalSystemsService,
) {
  return {
    upsert: implement(contract.externalSystems.upsert).handler(
      async ({ input }) => {
        const { system, created } = await externalSystemsService.upsert(input);
        return { ...system, created };
      },
    ),
    // No conflict-error class, for the same reason its single-item sibling
    // declares no CONFLICT error: an external system is matched by name
    // alone, so there is no ambiguity between existing rows. Passing
    // `undefined` keeps that omission explicit while still reusing the
    // shared per-item failure handling.
    upsertBatch: implement(contract.externalSystems.upsertBatch).handler(
      ({ input }) =>
        upsertHandler.runBatch(
          undefined,
          input.map((item) => async () => {
            const { system, created } =
              await externalSystemsService.upsert(item);
            return { entity: system, created };
          }),
        ),
    ),
  };
}

// players.syncScrapedSppAdjustments / syncReportedSppAdjustments: not routed
// through the upsert handler, for the same reason sppAwardValues.sync is
// not — no external-id conflict to map and no entity+created shape to
// return.
export function buildPlayerSppAdjustmentRoutes(
  sppAdjustmentsService: SppAdjustmentsService,
) {
  return {
    syncScrapedSppAdjustments: implement(
      contract.players.syncScrapedSppAdjustments,
    ).handler(({ input }) =>
      sppAdjustmentsService.syncScrapedAdjustments(input),
    ),
    syncReportedSppAdjustments: implement(
      contract.players.syncReportedSppAdjustments,
    ).handler(({ input }) =>
      sppAdjustmentsService.syncReportedAdjustments(input),
    ),
  };
}

// positions.syncRaceEras: not routed through the upsert handler — it syncs a
// race/era join, not an upsert with a conflict class. The one error it maps
// is the service's format mismatch: characteristics that disagree with what
// the named rules set declares are authored-data feedback the importer
// reports, so BAD_REQUEST rather than an internal error.
export function buildPositionSyncRaceErasRoute(
  positionsService: PositionsService,
) {
  return {
    syncRaceEras: implement(contract.positions.syncRaceEras).handler(
      async ({ input, errors }) => {
        try {
          return await positionsService.syncRaceEras(input);
        } catch (error) {
          if (error instanceof PositionRulesSetFormatMismatchError) {
            throw errors.BAD_REQUEST({ message: error.message });
          }
          throw error;
        }
      },
    ),
  };
}

// matches.resolveOutcomes: not routed through the upsert handler — this
// procedure has no CONFLICT/BAD_REQUEST error to map. A match whose outcome
// cannot be determined comes back in `unresolvedMatchIds` for the caller to
// report, rather than as a thrown error.
export function buildMatchResolveOutcomesRoute(
  matchOutcomes: MatchOutcomesService,
) {
  return {
    resolveOutcomes: implement(contract.matches.resolveOutcomes).handler(
      ({ input }) => matchOutcomes.resolveForCompetition(input),
    ),
  };
}

// competitionGroups.list: not one of the standard upsert/resolve shapes at
// all — it lists every group, mapping the drizzle row explicitly because it
// also carries the history-tracking columns, which are not part of the
// contract's CompetitionGroupSchema.
export function buildCompetitionGroupsListRoute(
  competitionGroupsService: CompetitionGroupsService,
) {
  return {
    list: implement(contract.competitionGroups.list).handler(async () => {
      const groups = await competitionGroupsService.listAll();
      return groups.map((group) => ({
        id: group.id,
        name: group.name,
        leagueId: group.leagueId,
        createdAt: group.createdAt,
      }));
    }),
  };
}
