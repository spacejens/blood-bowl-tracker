import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { TeamSchema, CreateTeamSchema } from './schemas/team';
import { MatchSchema, CreateMatchSchema } from './schemas/match';
import { MatchEventSchema, CreateMatchEventSchema } from './schemas/match-event';

const c = initContract();

export const contract = c.router({
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
});
