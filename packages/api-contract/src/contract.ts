import { oc } from '@orpc/contract';

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
import { MatchSchema, UpsertMatchSchema } from './schemas/match';
import {
  MatchEventSchema,
  UpsertMatchEventSchema,
} from './schemas/match-event';
import { PlayerSchema, UpsertPlayerSchema } from './schemas/player';
import {
  PositionSchema,
  SyncPositionRaceErasResultSchema,
  SyncPositionRaceErasSchema,
  UpsertPositionSchema,
} from './schemas/position';
import { RaceSchema, UpsertRaceSchema } from './schemas/race';
import { RulesSetSchema, UpsertRulesSetSchema } from './schemas/rules-set';
import { TeamSchema, UpsertTeamSchema } from './schemas/team';
import {
  upsertProcedure,
  upsertProcedureWithoutConflict,
} from './upsert-procedure';

export const contract = {
  coaches: {
    upsert: upsertProcedure(UpsertCoachSchema, CoachSchema),
  },
  leagues: {
    upsert: upsertProcedure(UpsertLeagueSchema, LeagueSchema),
  },
  races: {
    upsert: upsertProcedure(UpsertRaceSchema, RaceSchema),
  },
  players: {
    upsert: upsertProcedure(UpsertPlayerSchema, PlayerSchema),
  },
  positions: {
    upsert: upsertProcedure(UpsertPositionSchema, PositionSchema),
    syncRaceEras: oc
      .input(SyncPositionRaceErasSchema)
      .output(SyncPositionRaceErasResultSchema),
  },
  rulesSets: {
    upsert: upsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
  },
  eras: {
    upsert: upsertProcedure(UpsertEraSchema, EraSchema),
  },
  competitions: {
    upsert: upsertProcedure(UpsertCompetitionSchema, CompetitionSchema),
  },
  matches: {
    upsert: upsertProcedure(UpsertMatchSchema, MatchSchema),
  },
  matchEvents: {
    upsert: upsertProcedure(UpsertMatchEventSchema, MatchEventSchema),
  },
  teams: {
    upsert: upsertProcedure(UpsertTeamSchema, TeamSchema),
  },
  externalSystems: {
    // The only upsert with no CONFLICT error: an external system is matched
    // by name alone (see ExternalSystemsService.upsert), so there's no
    // possibility of multiple existing rows to conflict between.
    upsert: upsertProcedureWithoutConflict(
      UpsertExternalSystemSchema,
      ExternalSystemSchema,
    ),
  },
};
