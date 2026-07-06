import { oc, populateContractRouterPaths } from '@orpc/contract';
import { z } from 'zod';
import {
  CoachSchema,
  CreateCoachSchema,
  UpsertCoachSchema,
} from './schemas/coach';
import {
  ExternalSystemSchema,
  CreateExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';
import { RaceSchema, CreateRaceSchema } from './schemas/race';
import { RulesSetSchema, CreateRulesSetSchema } from './schemas/rules-set';
import { LeagueSchema, CreateLeagueSchema } from './schemas/league';
import { PositionSchema, CreatePositionSchema } from './schemas/position';
import { EraSchema, CreateEraSchema } from './schemas/era';
import {
  CompetitionSchema,
  CreateCompetitionSchema,
} from './schemas/competition';
import { TeamSchema, CreateTeamSchema } from './schemas/team';
import { TeamEraSchema, CreateTeamEraSchema } from './schemas/team-era';
import { PlayerSchema, CreatePlayerSchema } from './schemas/player';
import { MatchSchema, CreateMatchSchema } from './schemas/match';
import {
  MatchEventSchema,
  CreateMatchEventSchema,
} from './schemas/match-event';
import {
  RaceRulesSetSchema,
  CreateRaceRulesSetSchema,
} from './schemas/race-rules-set';
import {
  CompetitionTeamSchema,
  CreateCompetitionTeamSchema,
} from './schemas/competition-team';
import { MatchTeamSchema, CreateMatchTeamSchema } from './schemas/match-team';

export const contract = populateContractRouterPaths({
  coaches: {
    list: oc
      .route({ method: 'GET', path: '/coaches' })
      .output(z.array(CoachSchema)),
    getById: oc
      .route({ method: 'GET', path: '/coaches/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Coach not found' } })
      .output(CoachSchema),
    create: oc
      .route({ method: 'POST', path: '/coaches', successStatus: 201 })
      .input(CreateCoachSchema)
      .output(CoachSchema),
    upsert: oc
      .route({ method: 'POST', path: '/coaches/upsert' })
      .input(UpsertCoachSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(CoachSchema.extend({ created: z.boolean() })),
  },
  externalSystems: {
    list: oc
      .route({ method: 'GET', path: '/external-systems' })
      .output(z.array(ExternalSystemSchema)),
    getById: oc
      .route({ method: 'GET', path: '/external-systems/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'External system not found' } })
      .output(ExternalSystemSchema),
    create: oc
      .route({ method: 'POST', path: '/external-systems', successStatus: 201 })
      .input(CreateExternalSystemSchema)
      .output(ExternalSystemSchema),
    upsert: oc
      .route({ method: 'POST', path: '/external-systems/upsert' })
      .input(UpsertExternalSystemSchema)
      .output(ExternalSystemSchema.extend({ created: z.boolean() })),
  },
  races: {
    list: oc
      .route({ method: 'GET', path: '/races' })
      .output(z.array(RaceSchema)),
    getById: oc
      .route({ method: 'GET', path: '/races/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Race not found' } })
      .output(RaceSchema),
    create: oc
      .route({ method: 'POST', path: '/races', successStatus: 201 })
      .input(CreateRaceSchema)
      .output(RaceSchema),
  },
  rulesSets: {
    list: oc
      .route({ method: 'GET', path: '/rules-sets' })
      .output(z.array(RulesSetSchema)),
    getById: oc
      .route({ method: 'GET', path: '/rules-sets/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Rules set not found' } })
      .output(RulesSetSchema),
    create: oc
      .route({ method: 'POST', path: '/rules-sets', successStatus: 201 })
      .input(CreateRulesSetSchema)
      .output(RulesSetSchema),
  },
  leagues: {
    list: oc
      .route({ method: 'GET', path: '/leagues' })
      .output(z.array(LeagueSchema)),
    getById: oc
      .route({ method: 'GET', path: '/leagues/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'League not found' } })
      .output(LeagueSchema),
    create: oc
      .route({ method: 'POST', path: '/leagues', successStatus: 201 })
      .input(CreateLeagueSchema)
      .output(LeagueSchema),
  },
  positions: {
    list: oc
      .route({ method: 'GET', path: '/positions' })
      .output(z.array(PositionSchema)),
    getById: oc
      .route({ method: 'GET', path: '/positions/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Position not found' } })
      .output(PositionSchema),
    create: oc
      .route({ method: 'POST', path: '/positions', successStatus: 201 })
      .input(CreatePositionSchema)
      .output(PositionSchema),
  },
  eras: {
    list: oc.route({ method: 'GET', path: '/eras' }).output(z.array(EraSchema)),
    getById: oc
      .route({ method: 'GET', path: '/eras/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Era not found' } })
      .output(EraSchema),
    create: oc
      .route({ method: 'POST', path: '/eras', successStatus: 201 })
      .input(CreateEraSchema)
      .output(EraSchema),
  },
  competitions: {
    list: oc
      .route({ method: 'GET', path: '/competitions' })
      .output(z.array(CompetitionSchema)),
    getById: oc
      .route({ method: 'GET', path: '/competitions/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Competition not found' } })
      .output(CompetitionSchema),
    create: oc
      .route({ method: 'POST', path: '/competitions', successStatus: 201 })
      .input(CreateCompetitionSchema)
      .output(CompetitionSchema),
  },
  teams: {
    list: oc
      .route({ method: 'GET', path: '/teams' })
      .output(z.array(TeamSchema)),
    getById: oc
      .route({ method: 'GET', path: '/teams/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Team not found' } })
      .output(TeamSchema),
    create: oc
      .route({ method: 'POST', path: '/teams', successStatus: 201 })
      .input(CreateTeamSchema)
      .output(TeamSchema),
  },
  teamEras: {
    list: oc
      .route({ method: 'GET', path: '/team-eras' })
      .output(z.array(TeamEraSchema)),
    getById: oc
      .route({ method: 'GET', path: '/team-eras/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Team era not found' } })
      .output(TeamEraSchema),
    create: oc
      .route({ method: 'POST', path: '/team-eras', successStatus: 201 })
      .input(CreateTeamEraSchema)
      .output(TeamEraSchema),
  },
  players: {
    list: oc
      .route({ method: 'GET', path: '/players' })
      .output(z.array(PlayerSchema)),
    getById: oc
      .route({ method: 'GET', path: '/players/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Player not found' } })
      .output(PlayerSchema),
    create: oc
      .route({ method: 'POST', path: '/players', successStatus: 201 })
      .input(CreatePlayerSchema)
      .output(PlayerSchema),
  },
  matches: {
    list: oc
      .route({ method: 'GET', path: '/matches' })
      .output(z.array(MatchSchema)),
    getById: oc
      .route({ method: 'GET', path: '/matches/{id}' })
      .input(z.object({ id: z.coerce.number() }))
      .errors({ NOT_FOUND: { message: 'Match not found' } })
      .output(MatchSchema),
    create: oc
      .route({ method: 'POST', path: '/matches', successStatus: 201 })
      .input(CreateMatchSchema)
      .output(MatchSchema),
  },
  matchEvents: {
    listByMatch: oc
      .route({ method: 'GET', path: '/matches/{matchId}/events' })
      .input(z.object({ matchId: z.coerce.number() }))
      .output(z.array(MatchEventSchema)),
    create: oc
      .route({ method: 'POST', path: '/match-events', successStatus: 201 })
      .input(CreateMatchEventSchema)
      .output(MatchEventSchema),
  },
  raceRulesSets: {
    list: oc
      .route({ method: 'GET', path: '/race-rules-sets' })
      .output(z.array(RaceRulesSetSchema)),
    create: oc
      .route({ method: 'POST', path: '/race-rules-sets', successStatus: 201 })
      .input(CreateRaceRulesSetSchema)
      .output(RaceRulesSetSchema),
  },
  competitionTeams: {
    list: oc
      .route({ method: 'GET', path: '/competition-teams' })
      .output(z.array(CompetitionTeamSchema)),
    create: oc
      .route({
        method: 'POST',
        path: '/competition-teams',
        successStatus: 201,
      })
      .input(CreateCompetitionTeamSchema)
      .output(CompetitionTeamSchema),
  },
  matchTeams: {
    list: oc
      .route({ method: 'GET', path: '/match-teams' })
      .output(z.array(MatchTeamSchema)),
    create: oc
      .route({ method: 'POST', path: '/match-teams', successStatus: 201 })
      .input(CreateMatchTeamSchema)
      .output(MatchTeamSchema),
  },
});
