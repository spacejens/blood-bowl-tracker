import { oc } from '@orpc/contract';

import { batchUpsertProcedure } from './batch-upsert-procedure';
import { CoachSchema, UpsertCoachSchema } from './schemas/coach';
import {
  CompetitionSchema,
  UpsertCompetitionSchema,
} from './schemas/competition';
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
import { RaceSchema, UpsertRaceSchema } from './schemas/race';
import { RulesSetSchema, UpsertRulesSetSchema } from './schemas/rules-set';
import {
  SyncSppAwardValuesResultSchema,
  SyncSppAwardValuesSchema,
} from './schemas/spp-award-value';
import { TeamSchema, UpsertTeamSchema } from './schemas/team';
import { TrophySchema, UpsertTrophySchema } from './schemas/trophy';
import {
  upsertProcedure,
  upsertProcedureWithoutConflict,
} from './upsert-procedure';

export const contract = {
  coaches: {
    upsert: upsertProcedure(UpsertCoachSchema, CoachSchema),
    upsertBatch: batchUpsertProcedure(UpsertCoachSchema, CoachSchema),
  },
  leagues: {
    upsert: upsertProcedure(UpsertLeagueSchema, LeagueSchema),
    upsertBatch: batchUpsertProcedure(UpsertLeagueSchema, LeagueSchema),
  },
  races: {
    upsert: upsertProcedure(UpsertRaceSchema, RaceSchema),
    upsertBatch: batchUpsertProcedure(UpsertRaceSchema, RaceSchema),
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
    // Not an upsert: this adds position-race-era availability links without
    // ever removing or overwriting existing ones (see
    // PositionsService.syncRaceEras), so there's no conflict to detect and
    // no entity+created shape to return — just the resulting link ids.
    syncRaceEras: oc
      .input(SyncPositionRaceErasSchema)
      .output(SyncPositionRaceErasResultSchema),
  },
  rulesSets: {
    upsert: upsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
    upsertBatch: batchUpsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
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
  },
  competitions: {
    upsert: upsertProcedure(UpsertCompetitionSchema, CompetitionSchema),
    upsertBatch: batchUpsertProcedure(
      UpsertCompetitionSchema,
      CompetitionSchema,
    ),
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
  },
  trophies: {
    // Deliberately no `upsertBatch`: the only caller is tools/import-manual
    // with 29 curated rows, so batching saves nothing. Same reasoning as
    // `sppAwardValues`, which likewise defines a non-standard router.
    upsert: upsertProcedure(UpsertTrophySchema, TrophySchema),
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
