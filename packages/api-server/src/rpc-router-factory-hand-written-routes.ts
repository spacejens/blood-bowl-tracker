import { contract } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionGroupsService,
  ExternalSystemsService,
  KeywordsService,
  MatchOutcomesService,
  MissingTrophyAwardsService,
  PlayerLastingInjuryBackfillService,
  PlayerSkillsService,
  PositionRulesSetKeywordsService,
  PositionRulesSetSkillsService,
  PositionRulesSetsService,
  PositionsService,
  SkillRulesSetsService,
  SppAdjustmentsService,
  SppAwardValuesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import {
  TpCompetitionImportService,
  TpMatchImportService,
  TpOfficialTeamsImportService,
  TpRosterImportService,
} from '@blood-bowl-tracker/import-tp-live';
import { implement } from '@orpc/server';

import type { UpsertHandlerService } from './upsert-handler.service';

/**
 * Route-building for procedures that are fully hand-written forever — they
 * never use any of RpcRouterFactoryService's generic route builders, either
 * because the whole entity is non-standard (sppAwardValues, trophyAwards,
 * externalSystems) or because the procedure is a one-off extra alongside an
 * otherwise-standard entity (e.g. positions.syncRaceEras). These live here —
 * rather than the generic builder methods, which stay in
 * rpc-router-factory.service.ts — purely to keep that file under its
 * 500-line ESLint cap; each comment below records why its own procedure is
 * hand-written. This fits CLAUDE.md's "Service vs. loose function"
 * exemption 2 — pure assembly wrapped by a factory service — the same
 * pattern as `buildFactTree`/`FactTreeFactoryService`:
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

// trophyAwards: `upsert` plus `computeMissing`, matching the contract —
// award rows are few enough that batching buys nothing. No conflict class on
// `upsert`: `trophy_awards` has a database unique constraint on its natural
// key, so the dedup lookup can never match more than one row.
// `runWithoutConflict` still maps a recipient-kind mismatch to BAD_REQUEST.
export function buildTrophyAwardsRoutes(options: {
  upsertHandler: UpsertHandlerService;
  trophyAwardsService: TrophyAwardsService;
  missingTrophyAwards: MissingTrophyAwardsService;
}) {
  const { upsertHandler, trophyAwardsService, missingTrophyAwards } = options;
  return {
    upsert: implement(contract.trophyAwards.upsert).handler(
      ({ input, errors }) =>
        upsertHandler.runWithoutConflict(errors, async () => {
          const { trophyAward, created } =
            await trophyAwardsService.upsert(input);
          return { entity: trophyAward, created };
        }),
    ),
    // Competition-scoped compute-in-place, like `matches.resolveOutcomes`:
    // the whole rule lives in MissingTrophyAwardsService, so the route is one
    // delegation and nothing else.
    computeMissing: implement(contract.trophyAwards.computeMissing).handler(
      ({ input }) =>
        missingTrophyAwards.computeMissingAwards(input.competitionId),
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

// players.syncScrapedSppAdjustments / syncReportedSppAdjustments /
// syncLastingInjuryHistory: not routed through the upsert handler, for the
// same reason sppAwardValues.sync is not — no external-id conflict to map and
// no entity+created shape to return.
//
// syncLastingInjuryHistory is the post-matchEvents backfill: it manufactures
// the players_history versions a freshly-inserted player needs for a lasting
// injury healed before the run, reading match_events the importer has already
// written. It delegates straight through, like every other sync route here.
export function buildPlayerSppAdjustmentRoutes(
  sppAdjustmentsService: SppAdjustmentsService,
  lastingInjuryBackfillService: PlayerLastingInjuryBackfillService,
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
    syncLastingInjuryHistory: implement(
      contract.players.syncLastingInjuryHistory,
    ).handler(({ input }) =>
      lastingInjuryBackfillService.syncLastingInjuryHistory(input),
    ),
  };
}

// positionRulesSets: not routed through the upsert handler's `run`/
// `runWithoutConflict`, for the same reason sppAwardValues.sync is not — a row
// is keyed by (positionId, rulesSetId) rather than external ids, so there is no
// CONFLICT to map and no entity+created shape to return. It does still go
// through the handler's `runSync`, which owns the one classification this
// procedure needs: a characteristic format mismatch is authored-data feedback
// the importer reports per entry, so BAD_REQUEST rather than an internal error.
export function buildPositionRulesSetsRoutes(
  upsertHandler: UpsertHandlerService,
  positionRulesSetsService: PositionRulesSetsService,
) {
  return {
    sync: implement(contract.positionRulesSets.sync).handler(
      ({ input, errors }) =>
        upsertHandler.runSync(errors, () =>
          positionRulesSetsService.sync(input),
        ),
    ),
  };
}

// positions.syncRaceEras: not routed through the upsert handler — it syncs a
// race/era join, not an upsert with a conflict class.
export function buildPositionSyncRaceErasRoute(
  positionsService: PositionsService,
) {
  return {
    syncRaceEras: implement(contract.positions.syncRaceEras).handler(
      ({ input }) => positionsService.syncRaceEras(input),
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
// all — it lists every group. The service's `listAllForApi` projects the
// contract's CompetitionGroupSchema fields in the query, so the
// history-tracking columns the contract does not carry are never read here.
export function buildCompetitionGroupsListRoute(
  competitionGroupsService: CompetitionGroupsService,
) {
  return {
    list: implement(contract.competitionGroups.list).handler(() =>
      competitionGroupsService.listAllForApi(),
    ),
  };
}

// skillRulesSets: not routed through the upsert handler's `run`/
// `runWithoutConflict`, for the same reason positionRulesSets.sync is not — a
// row is keyed by (skillId, rulesSetId) rather than external ids, so there is
// no CONFLICT to map and no entity+created shape to return. It does go
// through `runSync`, which maps the one authored-data failure it can raise (a
// pair named twice in one batch) to BAD_REQUEST.
//
// `list` is plainly read-only and declares no errors. It delegates to
// `listBySkill`, whose rows also carry the rules set's name; the contract's
// output schema does not, so that never reaches the caller.
export function buildSkillRulesSetsRoutes(
  upsertHandler: UpsertHandlerService,
  skillRulesSetsService: SkillRulesSetsService,
) {
  return {
    sync: implement(contract.skillRulesSets.sync).handler(({ input, errors }) =>
      upsertHandler.runSync(errors, () => skillRulesSetsService.sync(input)),
    ),
    list: implement(contract.skillRulesSets.list).handler(({ input }) =>
      skillRulesSetsService.listBySkill(input.skillId),
    ),
  };
}

// positionRulesSetSkills: same shape and same reasoning as skillRulesSets
// above. `runSync` maps the service's authored-data rejections — a skill the
// rules set does not have, and a position/rules-set pair with no
// characteristics recorded yet — to BAD_REQUEST.
//
// `list` delegates to `listByPosition`, whose rows also carry the rules set's
// and the skill's names; the contract's output schema carries neither.
export function buildPositionRulesSetSkillsRoutes(
  upsertHandler: UpsertHandlerService,
  positionRulesSetSkillsService: PositionRulesSetSkillsService,
) {
  return {
    sync: implement(contract.positionRulesSetSkills.sync).handler(
      ({ input, errors }) =>
        upsertHandler.runSync(errors, () =>
          positionRulesSetSkillsService.sync(input),
        ),
    ),
    list: implement(contract.positionRulesSetSkills.list).handler(({ input }) =>
      positionRulesSetSkillsService.listByPosition(input.positionId),
    ),
  };
}

// positionRulesSetKeywords: same shape and same reasoning as
// positionRulesSetSkills above. `runSync` maps the service's authored-data
// rejections -- a position/rules-set pair with no characteristics row, and a
// batch repeating one natural key -- to BAD_REQUEST. `list` delegates to
// `listByPosition`, whose rows also carry the rules set's and the keyword's
// names; the contract's output schema carries the keyword's name but not the
// rules set's.
export function buildPositionRulesSetKeywordsRoutes(
  upsertHandler: UpsertHandlerService,
  positionRulesSetKeywordsService: PositionRulesSetKeywordsService,
) {
  return {
    sync: implement(contract.positionRulesSetKeywords.sync).handler(
      ({ input, errors }) =>
        upsertHandler.runSync(errors, () =>
          positionRulesSetKeywordsService.sync(input),
        ),
    ),
    list: implement(contract.positionRulesSetKeywords.list).handler(
      ({ input }) =>
        positionRulesSetKeywordsService.listByPosition(input.positionId),
    ),
  };
}

// keywords.list: read-only, so it does not go through the upsert handler at
// all. The rest of the keywords router is the standard entity shape and is
// built by RpcRouterFactoryService.buildStandardEntityRoutes.
export function buildKeywordsListRoute(keywordsService: KeywordsService) {
  return {
    list: implement(contract.keywords.list).handler(({ input }) =>
      keywordsService.listByExternalSystem(input.externalSystemId),
    ),
  };
}

// playerSkills: same shape and same reasoning as positionRulesSetSkills
// above. `runSync` maps the service's authored-data rejections — a player or
// skill that does not exist, and a batch repeating one natural key — to
// BAD_REQUEST.
//
// `list` delegates to `listByPlayer`, whose rows also carry the skill's name
// and its category and elite flag under the requested rules set; the
// contract's output schema carries none of those.
export function buildPlayerSkillsRoutes(
  upsertHandler: UpsertHandlerService,
  playerSkillsService: PlayerSkillsService,
) {
  return {
    sync: implement(contract.playerSkills.sync).handler(({ input, errors }) =>
      upsertHandler.runSync(errors, () => playerSkillsService.sync(input)),
    ),
    list: implement(contract.playerSkills.list).handler(({ input }) =>
      playerSkillsService.listByPlayer(input.playerId, input.rulesSetId),
    ),
  };
}

// tpRosters.import: a coarse TP import, not an upsert of one entity. Every
// failure is reported in the result's ImportResults, so it declares no
// contract error and is not routed through the upsert handler.
export function buildTpRostersRoutes(tpRosterImport: TpRosterImportService) {
  return {
    import: implement(contract.tpRosters.import).handler(({ input }) =>
      tpRosterImport.importRawRoster({
        content: input.roster,
        era: input.era,
        externalSystemName: input.externalSystemName,
        matchEmbeddedPlayers: input.matchEmbeddedPlayers,
      }),
    ),
  };
}

// tpMatches.import: a coarse TP import, like tpRosters.import. Every failure
// is reported in the result's ImportResults, so it declares no contract
// error and is not routed through the upsert handler.
export function buildTpMatchesRoutes(tpMatchImport: TpMatchImportService) {
  return {
    import: implement(contract.tpMatches.import).handler(({ input }) =>
      tpMatchImport.importRawMatch({
        content: input.match,
        bracket: input.bracket,
        competitionTpId: input.competitionTpId,
        externalSystemName: input.externalSystemName,
      }),
    ),
  };
}

// tpCompetitions.import: a coarse TP import, like tpRosters.import. Every
// failure is reported in the result's ImportResults, so it declares no
// contract error and is not routed through the upsert handler.
export function buildTpCompetitionsRoutes(
  tpCompetitionImport: TpCompetitionImportService,
) {
  return {
    import: implement(contract.tpCompetitions.import).handler(({ input }) =>
      tpCompetitionImport.importCompetition(input),
    ),
  };
}

// tpOfficialTeams.import: a coarse TP import, like tpRosters.import. Every
// failure is reported in the result's per-stage ImportResults, so it
// declares no contract error and is not routed through the upsert handler.
export function buildTpOfficialTeamsRoutes(
  tpOfficialTeamsImport: TpOfficialTeamsImportService,
) {
  return {
    import: implement(contract.tpOfficialTeams.import).handler(({ input }) =>
      tpOfficialTeamsImport.importOfficialTeams(input),
    ),
  };
}
