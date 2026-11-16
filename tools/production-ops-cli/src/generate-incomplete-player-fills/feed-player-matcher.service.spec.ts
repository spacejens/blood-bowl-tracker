import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpFeedHistoryReports } from '../read-tp-feed-history/tp-feed-history-index.service';
import { FeedPlayerMatcherService } from './feed-player-matcher.service';
import { report } from './fill-plan.test-helpers';
import type { TeamPlayerRow, TeamRosterRow } from './fill-plan.types';

const ROSTERS: TeamRosterRow[] = [{ teamId: 20, rosterId: '24801' }];
const FLAME: TeamPlayerRow = {
  playerId: 1,
  teamId: 20,
  playerName: 'Flame',
  positionName: 'Gnoblar Lineman',
};
const KEY = '#13 Flame (Gnoblar Lineman)';

describe('FeedPlayerMatcherService', () => {
  let service: FeedPlayerMatcherService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FeedPlayerMatcherService],
    }).compile();
    service = moduleRef.get(FeedPlayerMatcherService);
  });

  it('gives a stored player the reports of the one key that names him', () => {
    const reports = [report(), report({ messageId: '1057968552151359500' })];

    const result = service.match({
      reports: { Firestarters: { [KEY]: reports } },
      rosters: ROSTERS,
      players: [FLAME],
    });

    expect(result.byPlayer).toEqual(
      new Map([[1, { kind: 'reports', reports }]]),
    );
    expect(result.summary).toEqual({
      reportKeys: 1,
      matchedKeys: 1,
      ambiguousKeys: 0,
      unmatchedKeys: 0,
    });
  });

  it('leaves a key whose roster is no stored team unmatched', () => {
    const result = service.match({
      reports: { Firestarters: { [KEY]: [report()] } },
      rosters: [{ teamId: 20, rosterId: '99' }],
      players: [FLAME],
    });

    expect(result.byPlayer.size).toBe(0);
    expect(result.summary.unmatchedKeys).toBe(1);
  });

  it('leaves a key that names no stored player of the team unmatched', () => {
    const result = service.match({
      reports: { Firestarters: { [KEY]: [report({ playerName: 'Spark' })] } },
      rosters: ROSTERS,
      players: [FLAME],
    });

    expect(result.byPlayer.size).toBe(0);
    expect(result.summary.unmatchedKeys).toBe(1);
  });

  it('does not match a player of another team with the same name and position', () => {
    const result = service.match({
      reports: { Firestarters: { [KEY]: [report()] } },
      rosters: ROSTERS,
      players: [{ ...FLAME, teamId: 21 }],
    });

    expect(result.byPlayer.size).toBe(0);
  });

  it('marks every stored player a key names as ambiguous when it names several', () => {
    const result = service.match({
      reports: { Firestarters: { [KEY]: [report()] } },
      rosters: ROSTERS,
      players: [FLAME, { ...FLAME, playerId: 2 }],
    });

    expect(result.byPlayer).toEqual(
      new Map([
        [1, { kind: 'ambiguous' }],
        [2, { kind: 'ambiguous' }],
      ]),
    );
    expect(result.summary.ambiguousKeys).toBe(1);
  });

  it('marks a stored player named by two keys as ambiguous', () => {
    const reports: TpFeedHistoryReports = {
      Firestarters: {
        [KEY]: [report()],
        '#7 Flame (Gnoblar Lineman)': [report({ playerNumber: '7' })],
      },
    };

    const result = service.match({
      reports,
      rosters: ROSTERS,
      players: [FLAME],
    });

    expect(result.byPlayer).toEqual(new Map([[1, { kind: 'ambiguous' }]]));
    expect(result.summary.matchedKeys).toBe(2);
  });

  it('keeps a player ambiguous when another key names him alone', () => {
    // Roster 24801 links teams 20 and 21, so its key names players 1 and 2;
    // roster 777 links team 20 alone, so its key names player 1 alone.
    const reports: TpFeedHistoryReports = {
      Firestarters: {
        [KEY]: [report()],
        '#13 Flame (Gnoblar Lineman) again': [
          report({
            rosterLink: 'https://tourplay.net/en/blood-bowl/roster/777',
          }),
        ],
      },
    };

    const result = service.match({
      reports,
      rosters: [
        { teamId: 20, rosterId: '24801' },
        { teamId: 21, rosterId: '24801' },
        { teamId: 20, rosterId: '777' },
      ],
      players: [FLAME, { ...FLAME, playerId: 2, teamId: 21 }],
    });

    expect(result.byPlayer).toEqual(
      new Map([
        [1, { kind: 'ambiguous' }],
        [2, { kind: 'ambiguous' }],
      ]),
    );
    expect(result.summary).toMatchObject({ matchedKeys: 1, ambiguousKeys: 1 });
  });

  it('treats a key whose reports name two rosters as ambiguous', () => {
    const result = service.match({
      reports: {
        Firestarters: {
          [KEY]: [
            report(),
            report({
              rosterLink: 'https://tourplay.net/en/blood-bowl/roster/1',
            }),
          ],
        },
      },
      rosters: ROSTERS,
      players: [FLAME],
    });

    expect(result.byPlayer.size).toBe(0);
    expect(result.summary.ambiguousKeys).toBe(1);
  });

  it('leaves a key without a readable roster link, or without reports, unmatched', () => {
    const result = service.match({
      reports: {
        Firestarters: {
          [KEY]: [report({ rosterLink: 'https://tourplay.net/en' })],
          '#2 Empty (Gnoblar Lineman)': [],
        },
      },
      rosters: ROSTERS,
      players: [FLAME],
    });

    expect(result.byPlayer.size).toBe(0);
    expect(result.summary).toEqual({
      reportKeys: 2,
      matchedKeys: 0,
      ambiguousKeys: 0,
      unmatchedKeys: 2,
    });
  });

  it('finds a team under any of its roster ids', () => {
    const result = service.match({
      reports: { Firestarters: { [KEY]: [report()] } },
      rosters: [
        { teamId: 20, rosterId: '1' },
        { teamId: 20, rosterId: '24801' },
      ],
      players: [FLAME],
    });

    expect(result.byPlayer.get(1)?.kind).toBe('reports');
  });
});
