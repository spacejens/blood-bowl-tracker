import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CoachSchema, CreateCoachSchema } from './schemas/coach';
import { RaceSchema, CreateRaceSchema } from './schemas/race';
import { RulesSetSchema, CreateRulesSetSchema } from './schemas/rules-set';
import { LeagueSchema, CreateLeagueSchema } from './schemas/league';
import { PositionSchema, CreatePositionSchema } from './schemas/position';
import { EraSchema, CreateEraSchema } from './schemas/era';
import { CompetitionSchema, CreateCompetitionSchema } from './schemas/competition';
import { TeamSchema, CreateTeamSchema } from './schemas/team';
import { PlayerSchema, CreatePlayerSchema } from './schemas/player';
import { MatchSchema, CreateMatchSchema } from './schemas/match';
import { MatchEventSchema, CreateMatchEventSchema } from './schemas/match-event';
import { RaceRulesSetSchema, CreateRaceRulesSetSchema } from './schemas/race-rules-set';
import { CompetitionTeamSchema, CreateCompetitionTeamSchema } from './schemas/competition-team';
import { MatchTeamSchema, CreateMatchTeamSchema } from './schemas/match-team';

const c = initContract();

export const contract = c.router({
  coaches: c.router({
    list: {
      method: 'GET',
      path: '/coaches',
      responses: { 200: z.array(CoachSchema) },
    },
    getById: {
      method: 'GET',
      path: '/coaches/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: CoachSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/coaches',
      body: CreateCoachSchema,
      responses: { 201: CoachSchema },
    },
  }),
  races: c.router({
    list: {
      method: 'GET',
      path: '/races',
      responses: { 200: z.array(RaceSchema) },
    },
    getById: {
      method: 'GET',
      path: '/races/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: RaceSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/races',
      body: CreateRaceSchema,
      responses: { 201: RaceSchema },
    },
  }),
  rulesSets: c.router({
    list: {
      method: 'GET',
      path: '/rules-sets',
      responses: { 200: z.array(RulesSetSchema) },
    },
    getById: {
      method: 'GET',
      path: '/rules-sets/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: RulesSetSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/rules-sets',
      body: CreateRulesSetSchema,
      responses: { 201: RulesSetSchema },
    },
  }),
  leagues: c.router({
    list: {
      method: 'GET',
      path: '/leagues',
      responses: { 200: z.array(LeagueSchema) },
    },
    getById: {
      method: 'GET',
      path: '/leagues/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: LeagueSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/leagues',
      body: CreateLeagueSchema,
      responses: { 201: LeagueSchema },
    },
  }),
  positions: c.router({
    list: {
      method: 'GET',
      path: '/positions',
      responses: { 200: z.array(PositionSchema) },
    },
    getById: {
      method: 'GET',
      path: '/positions/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: PositionSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/positions',
      body: CreatePositionSchema,
      responses: { 201: PositionSchema },
    },
  }),
  eras: c.router({
    list: {
      method: 'GET',
      path: '/eras',
      responses: { 200: z.array(EraSchema) },
    },
    getById: {
      method: 'GET',
      path: '/eras/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: EraSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/eras',
      body: CreateEraSchema,
      responses: { 201: EraSchema },
    },
  }),
  competitions: c.router({
    list: {
      method: 'GET',
      path: '/competitions',
      responses: { 200: z.array(CompetitionSchema) },
    },
    getById: {
      method: 'GET',
      path: '/competitions/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: CompetitionSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/competitions',
      body: CreateCompetitionSchema,
      responses: { 201: CompetitionSchema },
    },
  }),
  teams: c.router({
    list: {
      method: 'GET',
      path: '/teams',
      responses: { 200: z.array(TeamSchema) },
    },
    getById: {
      method: 'GET',
      path: '/teams/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: TeamSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/teams',
      body: CreateTeamSchema,
      responses: { 201: TeamSchema },
    },
  }),
  players: c.router({
    list: {
      method: 'GET',
      path: '/players',
      responses: { 200: z.array(PlayerSchema) },
    },
    getById: {
      method: 'GET',
      path: '/players/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: PlayerSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/players',
      body: CreatePlayerSchema,
      responses: { 201: PlayerSchema },
    },
  }),
  matches: c.router({
    list: {
      method: 'GET',
      path: '/matches',
      responses: { 200: z.array(MatchSchema) },
    },
    getById: {
      method: 'GET',
      path: '/matches/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: MatchSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/matches',
      body: CreateMatchSchema,
      responses: { 201: MatchSchema },
    },
  }),
  matchEvents: c.router({
    listByMatch: {
      method: 'GET',
      path: '/matches/:matchId/events',
      pathParams: z.object({ matchId: z.coerce.number() }),
      responses: { 200: z.array(MatchEventSchema) },
    },
    create: {
      method: 'POST',
      path: '/match-events',
      body: CreateMatchEventSchema,
      responses: { 201: MatchEventSchema },
    },
  }),
  raceRulesSets: c.router({
    list: {
      method: 'GET',
      path: '/race-rules-sets',
      responses: { 200: z.array(RaceRulesSetSchema) },
    },
    create: {
      method: 'POST',
      path: '/race-rules-sets',
      body: CreateRaceRulesSetSchema,
      responses: { 201: RaceRulesSetSchema },
    },
  }),
  competitionTeams: c.router({
    list: {
      method: 'GET',
      path: '/competition-teams',
      responses: { 200: z.array(CompetitionTeamSchema) },
    },
    create: {
      method: 'POST',
      path: '/competition-teams',
      body: CreateCompetitionTeamSchema,
      responses: { 201: CompetitionTeamSchema },
    },
  }),
  matchTeams: c.router({
    list: {
      method: 'GET',
      path: '/match-teams',
      responses: { 200: z.array(MatchTeamSchema) },
    },
    create: {
      method: 'POST',
      path: '/match-teams',
      body: CreateMatchTeamSchema,
      responses: { 201: MatchTeamSchema },
    },
  }),
});
