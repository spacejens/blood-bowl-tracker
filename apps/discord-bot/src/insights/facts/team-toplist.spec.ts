import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import {
  resolveTeamCasualtiesCausedToplist,
  resolveTeamCasualtiesSufferedToplist,
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamCompletionsToplist,
  resolveTeamDeathsCausedToplist,
  resolveTeamDeathsSufferedToplist,
  resolveTeamDeflectionsToplist,
  resolveTeamErasActiveToplist,
  resolveTeamFoulsCommittedToplist,
  resolveTeamInterceptionsToplist,
  resolveTeamLastingInjuriesSufferedToplist,
  resolveTeamMatchesPlayedToplist,
  resolveTeamSeriousInjuriesCausedToplist,
  resolveTeamSeriousInjuriesSufferedToplist,
  resolveTeamTimesSentOffToplist,
  resolveTeamTouchdownsScoredToplist,
} from './team-toplist';
import { expectTimeoutFallback } from './toplist.test-helpers';

interface TeamCase {
  describeName: string;
  method: keyof TeamsService;
  resolve: (
    teams: TeamsService,
    eraId?: number,
    competitionId?: number,
  ) => Promise<unknown>;
  rows: { teamId: number; name: string; count: number }[];
  eraRows?: { teamId: number; name: string; count: number }[];
  competitionRows?: { teamId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
}

const cases: TeamCase[] = [
  {
    describeName: 'resolveTeamMatchesPlayedToplist',
    method: 'countMatchesPlayedByTeam',
    resolve: (teams, eraId) => resolveTeamMatchesPlayedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 12 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    expectedTitle: 'Teams by matches played',
    expectedDescription: '1. 40 grinders — 12',
  },
  {
    describeName: 'resolveTeamCompetitionsPlayedToplist',
    method: 'countCompetitionsByTeam',
    resolve: (teams, eraId) =>
      resolveTeamCompetitionsPlayedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by competitions played',
    expectedDescription: '1. 40 grinders — 4',
  },
  {
    describeName: 'resolveTeamErasActiveToplist',
    method: 'countErasByTeam',
    resolve: (teams) => resolveTeamErasActiveToplist(teams),
    rows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    expectedTitle: 'Teams by eras active',
    expectedDescription: '1. 40 grinders — 3',
  },
  {
    describeName: 'resolveTeamTouchdownsScoredToplist',
    method: 'countTouchdownsScoredByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamTouchdownsScoredToplist(teams, eraId, competitionId),
    rows: [
      { teamId: 1, name: '40 grinders', count: 15 },
      { teamId: 2, name: 'Gouged Eye', count: 15 },
      { teamId: 3, name: 'Reikland Reavers', count: 6 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by touchdowns scored',
    expectedDescription:
      '1. 40 grinders — 15\n1. Gouged Eye — 15\n2. Reikland Reavers — 6',
  },
  {
    describeName: 'resolveTeamCompletionsToplist',
    method: 'countCompletionsByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamCompletionsToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by completions',
    expectedDescription: '1. 40 grinders — 8',
  },
  {
    describeName: 'resolveTeamInterceptionsToplist',
    method: 'countInterceptionsByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamInterceptionsToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by interceptions',
    expectedDescription: '1. 40 grinders — 5',
  },
  {
    describeName: 'resolveTeamDeflectionsToplist',
    method: 'countDeflectionsByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamDeflectionsToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deflections',
    expectedDescription: '1. 40 grinders — 4',
  },
  {
    describeName: 'resolveTeamCasualtiesCausedToplist',
    method: 'countCasualtiesCausedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamCasualtiesCausedToplist(teams, eraId, competitionId),
    rows: [
      { teamId: 1, name: '40 grinders', count: 22 },
      { teamId: 2, name: 'Gouged Eye', count: 22 },
      { teamId: 3, name: 'Reikland Reavers', count: 9 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by casualties inflicted',
    expectedDescription:
      '1. 40 grinders — 22\n1. Gouged Eye — 22\n2. Reikland Reavers — 9',
  },
  {
    describeName: 'resolveTeamSeriousInjuriesCausedToplist',
    method: 'countSeriousInjuriesCausedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamSeriousInjuriesCausedToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 7 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by serious injuries inflicted',
    expectedDescription: '1. 40 grinders — 7',
  },
  {
    describeName: 'resolveTeamDeathsCausedToplist',
    method: 'countDeathsCausedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamDeathsCausedToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by opponents killed',
    expectedDescription: '1. 40 grinders — 4',
  },
  {
    describeName: 'resolveTeamFoulsCommittedToplist',
    method: 'countFoulsCommittedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamFoulsCommittedToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 13 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by fouls committed',
    expectedDescription: '1. 40 grinders — 13',
  },
  {
    describeName: 'resolveTeamTimesSentOffToplist',
    method: 'countTimesSentOffByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamTimesSentOffToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by times sent off',
    expectedDescription: '1. 40 grinders — 8',
  },
  {
    describeName: 'resolveTeamCasualtiesSufferedToplist',
    method: 'countCasualtiesSufferedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamCasualtiesSufferedToplist(teams, eraId, competitionId),
    rows: [
      { teamId: 1, name: '40 grinders', count: 18 },
      { teamId: 2, name: 'Gouged Eye', count: 18 },
      { teamId: 3, name: 'Chaos All-Stars', count: 5 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by casualties suffered',
    expectedDescription:
      '1. 40 grinders — 18\n1. Gouged Eye — 18\n2. Chaos All-Stars — 5',
  },
  {
    describeName: 'resolveTeamSeriousInjuriesSufferedToplist',
    method: 'countSeriousInjuriesSufferedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamSeriousInjuriesSufferedToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 6 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by serious injuries suffered',
    expectedDescription: '1. 40 grinders — 6',
  },
  {
    describeName: 'resolveTeamLastingInjuriesSufferedToplist',
    method: 'countLastingInjuriesSufferedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamLastingInjuriesSufferedToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by lasting injuries suffered',
    expectedDescription: '1. 40 grinders — 4',
  },
  {
    describeName: 'resolveTeamDeathsSufferedToplist',
    method: 'countDeathsSufferedByTeam',
    resolve: (teams, eraId, competitionId) =>
      resolveTeamDeathsSufferedToplist(teams, eraId, competitionId),
    rows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deaths suffered',
    expectedDescription: '1. 40 grinders — 2',
  },
];

describe.each(cases)(
  '$describeName',
  ({
    method,
    resolve,
    rows,
    expectedTitle,
    expectedDescription,
    eraRows,
    competitionRows,
  }) => {
    it('returns a leaderboard embed with one deepdive button per team row', async () => {
      const teams = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as TeamsService;
      const result = (await resolve(teams)) as {
        embeds: { title: string; description: string }[];
        components: { components: { label: string; custom_id: string }[] }[];
      };
      expect(result.embeds).toEqual([
        { title: expectedTitle, description: expectedDescription },
      ]);
      const buttons = result.components.flatMap((row) => row.components);
      expect(buttons.map((b) => b.custom_id)).toEqual(
        rows.map((r) => `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${r.teamId}`),
      );
      expect(buttons.map((b) => b.label)).toEqual(rows.map((r) => r.name));
    });

    if (eraRows) {
      it('passes the era id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(eraRows);
        const teams = { [method]: queryFn } as unknown as TeamsService;
        await resolve(teams, 20);
        expect(queryFn).toHaveBeenCalledWith(
          ...(competitionRows ? [20, undefined] : [20]),
        );
      });
    }

    if (competitionRows) {
      it('passes the competition id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(competitionRows);
        const teams = { [method]: queryFn } as unknown as TeamsService;
        await resolve(teams, undefined, 30);
        expect(queryFn).toHaveBeenCalledWith(undefined, 30);
      });
    }

    it('falls back to the timeout message when the query does not respond in time', async () => {
      await expectTimeoutFallback(
        (teams: TeamsService) => resolve(teams),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as TeamsService,
        TEAM_TOPLIST_TIMEOUT_MESSAGE,
      );
    });
  },
);
