import { oc } from '@orpc/contract';
import { z } from 'zod';

import { batchUpsertProcedure } from './batch-upsert-procedure';
import { resolveBatchProcedure, resolveProcedure } from './resolve-procedure';
import { CoachSchema, UpsertCoachSchema } from './schemas/coach';
import {
  CompetitionSchema,
  UpsertCompetitionSchema,
} from './schemas/competition';
import {
  CompetitionGroupSchema,
  UpsertCompetitionGroupSchema,
} from './schemas/competition-group';
import { EraSchema, UpsertEraSchema } from './schemas/era';
import {
  ExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';
import { LeagueSchema, UpsertLeagueSchema } from './schemas/league';
import {
  MatchSchema,
  ResolveMatchOutcomesResultSchema,
  ResolveMatchOutcomesSchema,
  UpsertMatchSchema,
} from './schemas/match';
import {
  MatchEventSchema,
  UpsertMatchEventSchema,
} from './schemas/match-event';
import {
  PlayerSchema,
  SyncReportedSppAdjustmentsSchema,
  SyncScrapedSppAdjustmentsSchema,
  SyncSppAdjustmentsResultSchema,
  UpsertPlayerSchema,
} from './schemas/player';
import {
  PositionSchema,
  SyncPositionRaceErasResultSchema,
  SyncPositionRaceErasSchema,
  UpsertPositionSchema,
} from './schemas/position';
import {
  SyncPositionRulesSetsResultSchema,
  SyncPositionRulesSetsSchema,
} from './schemas/position-rules-set';
import { RaceSchema, UpsertRaceSchema } from './schemas/race';
import { RulesSetSchema, UpsertRulesSetSchema } from './schemas/rules-set';
import {
  SyncSppAwardValuesResultSchema,
  SyncSppAwardValuesSchema,
} from './schemas/spp-award-value';
import { TeamSchema, UpsertTeamSchema } from './schemas/team';
import { TrophySchema, UpsertTrophySchema } from './schemas/trophy';
import {
  TrophyAwardSchema,
  UpsertTrophyAwardSchema,
} from './schemas/trophy-award';
import {
  upsertProcedure,
  upsertProcedureBadRequestOnly,
  upsertProcedureWithoutConflict,
} from './upsert-procedure';

export const contract = {
  coaches: {
    upsert: upsertProcedure(UpsertCoachSchema, CoachSchema),
    upsertBatch: batchUpsertProcedure(UpsertCoachSchema, CoachSchema),
    // Resolve an external-id pair to this entity's database id. Present on
    // every entity kind an import tool references by external id across
    // files, phases or tools; see docs/api/rpc-conventions.md.
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  leagues: {
    upsert: upsertProcedure(UpsertLeagueSchema, LeagueSchema),
    upsertBatch: batchUpsertProcedure(UpsertLeagueSchema, LeagueSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  races: {
    upsert: upsertProcedure(UpsertRaceSchema, RaceSchema),
    upsertBatch: batchUpsertProcedure(UpsertRaceSchema, RaceSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  players: {
    upsert: upsertProcedure(UpsertPlayerSchema, PlayerSchema),
    upsertBatch: batchUpsertProcedure(UpsertPlayerSchema, PlayerSchema),
    // Not upserts: these recompute already-imported players' SPP columns in
    // place, so there is no external-id conflict to detect and no
    // entity+created shape to return — only the ids actually written. Same
    // shape as positions.syncRaceEras.
    syncScrapedSppAdjustments: oc
      .input(SyncScrapedSppAdjustmentsSchema)
      .output(SyncSppAdjustmentsResultSchema),
    syncReportedSppAdjustments: oc
      .input(SyncReportedSppAdjustmentsSchema)
      .output(SyncSppAdjustmentsResultSchema),
  },
  positions: {
    upsert: upsertProcedure(UpsertPositionSchema, PositionSchema),
    upsertBatch: batchUpsertProcedure(UpsertPositionSchema, PositionSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
    // Not an upsert: this adds position-race-era availability links without
    // ever removing or overwriting existing ones (see
    // PositionsService.syncRaceEras), so there's no conflict to detect and
    // no entity+created shape to return — just the resulting link ids.
    syncRaceEras: oc
      .input(SyncPositionRaceErasSchema)
      .output(SyncPositionRaceErasResultSchema),
  },
  positionRulesSets: {
    // Not an upsert: a position's characteristics row is keyed by
    // (positionId, rulesSetId) rather than external ids, so there is no
    // external-id conflict to detect and no entity+created shape to return,
    // only the resulting row ids — same shape as sppAwardValues.sync.
    // BAD_REQUEST is declared because the server rejects characteristics that
    // disagree with the rules set's declared formats (a supplied Passing for
    // a rules set that has none, or a missing one where the rules set
    // requires it); that is authored-data feedback the importer reports per
    // entry, not a server fault.
    sync: oc
      .input(SyncPositionRulesSetsSchema)
      .errors({
        BAD_REQUEST: {
          message: "Characteristics do not match the rules set's formats",
        },
      })
      .output(SyncPositionRulesSetsResultSchema),
  },
  rulesSets: {
    upsert: upsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
    upsertBatch: batchUpsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  sppAwardValues: {
    // Not an upsert: an award value has no external ids — it is keyed by
    // (rulesSetId, raceId, actionType) — so there is no conflict to detect
    // and no entity+created shape to return, only the resulting row ids.
    sync: oc
      .input(SyncSppAwardValuesSchema)
      .output(SyncSppAwardValuesResultSchema),
  },
  eras: {
    upsert: upsertProcedure(UpsertEraSchema, EraSchema),
    upsertBatch: batchUpsertProcedure(UpsertEraSchema, EraSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  competitions: {
    upsert: upsertProcedure(UpsertCompetitionSchema, CompetitionSchema),
    upsertBatch: batchUpsertProcedure(
      UpsertCompetitionSchema,
      CompetitionSchema,
    ),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  competitionGroups: {
    // Deliberately no `upsertBatch`: the only caller is tools/import-manual
    // with 16 curated rows, so batching saves nothing (same reasoning as
    // `trophies`).
    upsert: upsertProcedure(
      UpsertCompetitionGroupSchema,
      CompetitionGroupSchema,
    ),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
    // The one read procedure in this contract. tools/import-tp's awards
    // import holds a competition's competitionGroupId (from its own
    // competition upsert's response) but needs the group's curated *name* to
    // build a trophy's TP external id; `upsert` cannot answer that, because
    // the name is its input. The catalog is 16 rows, so the whole list is
    // returned unfiltered and mapped once per import run. Input is an empty
    // object rather than no input at all, so the generated client call site
    // is unambiguous (`list({})`).
    list: oc.input(z.object({})).output(z.array(CompetitionGroupSchema)),
  },
  matches: {
    upsert: upsertProcedure(UpsertMatchSchema, MatchSchema),
    upsertBatch: batchUpsertProcedure(UpsertMatchSchema, MatchSchema),
    // Not an upsert: this recomputes an already-imported competition's match
    // scores and winners in place, so there is no entity+created shape to
    // return and no external-id conflict to detect. Matches it cannot resolve
    // come back in `unresolvedMatchIds` rather than as a thrown error, so one
    // bad match does not cost the competition its other outcomes.
    resolveOutcomes: oc
      .input(ResolveMatchOutcomesSchema)
      .output(ResolveMatchOutcomesResultSchema),
  },
  matchEvents: {
    upsert: upsertProcedure(UpsertMatchEventSchema, MatchEventSchema),
    upsertBatch: batchUpsertProcedure(UpsertMatchEventSchema, MatchEventSchema),
  },
  teams: {
    upsert: upsertProcedure(UpsertTeamSchema, TeamSchema),
    upsertBatch: batchUpsertProcedure(UpsertTeamSchema, TeamSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  trophies: {
    // Deliberately no `upsertBatch`: the only caller is tools/import-manual
    // with 29 curated rows, so batching saves nothing. Same reasoning as
    // `sppAwardValues`, which likewise defines a non-standard router.
    upsert: upsertProcedure(UpsertTrophySchema, TrophySchema),
  },
  trophyAwards: {
    // Deliberately no `upsertBatch`: the whole BBL mirror yields under 400
    // award rows per run, so batching saves nothing. Same reasoning as
    // `trophies` and `competitionGroups`.
    //
    // No CONFLICT error: `trophy_awards` carries a database unique constraint
    // on its natural key (trophy, competition, team era, player), so the
    // dedup lookup can never match more than one row. BAD_REQUEST stays,
    // for an award whose player id does not fit the trophy's recipient kind
    // (see TrophyAwardsService).
    upsert: upsertProcedureBadRequestOnly(
      UpsertTrophyAwardSchema,
      TrophyAwardSchema,
    ),
  },
  externalSystems: {
    // The only upsert with no CONFLICT error: an external system is matched
    // by name alone (see ExternalSystemsService.upsert), so there's no
    // possibility of multiple existing rows to conflict between.
    upsert: upsertProcedureWithoutConflict(
      UpsertExternalSystemSchema,
      ExternalSystemSchema,
    ),
    // Uses the same builder as every other entity: batch results carry
    // failures as per-item error strings, so there is no CONFLICT error to
    // omit here.
    upsertBatch: batchUpsertProcedure(
      UpsertExternalSystemSchema,
      ExternalSystemSchema,
    ),
  },
};
