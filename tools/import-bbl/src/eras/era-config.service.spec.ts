import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { EraConfigService } from './era-config.service';

function makeService(eras: unknown): EraConfigService {
  const config = {
    get: (key: string) =>
      key === 'leagues' ? [{ leagueName: 'tLoEG', eras }] : undefined,
  } as unknown as ImportBblConfigService;
  return new EraConfigService(config);
}

function makeServiceForLeagues(leagues: unknown): EraConfigService {
  const config = {
    get: (key: string) => (key === 'leagues' ? leagues : undefined),
  } as unknown as ImportBblConfigService;
  return new EraConfigService(config);
}

const validEras = [
  {
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: {
      firstPlayerId: 1,
      lastPlayerId: 5000,
      autoAssignByPlayerId: true,
    },
  },
  {
    identity: { name: 'BB2020', rulesSets: ['BB2020'] },
    dates: { startDate: '2021-09-01', autoAssignByDate: true },
    players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
  },
];

describe('EraConfigService', () => {
  it('parses a valid eras array, leaving an omitted endDate/lastPlayerId undefined', () => {
    const eras = makeService(validEras).getEras();
    expect(eras).toHaveLength(2);
    expect(eras[0].identity).toEqual({
      name: 'Living rulebook',
      rulesSets: ['Living rulebook'],
    });
    expect(eras[0].dates).toEqual({
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    });
    expect(eras[0].players).toEqual({
      firstPlayerId: 1,
      lastPlayerId: 5000,
      autoAssignByPlayerId: true,
    });
    expect(eras[1].dates.endDate).toBeUndefined();
    expect(eras[1].players.lastPlayerId).toBeUndefined();
    expect(eras[1].players.firstPlayerId).toBe(5001);
  });

  it('throws when leagues is not set', () => {
    expect(() => makeServiceForLeagues(undefined).getEras()).toThrow(
      'leagues is not set in import-bbl-config.json5',
    );
  });

  it('throws when leagues is not a non-empty array', () => {
    expect(() => makeServiceForLeagues([]).getEras()).toThrow('non-empty');
  });

  it('stamps each era with the name of the league it came from', () => {
    const leagues = [
      {
        leagueName: 'tLoEG',
        eras: [
          {
            identity: { name: 'First era', rulesSets: ['BB2016'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: { firstPlayerId: 1, autoAssignByPlayerId: true },
          },
        ],
      },
      {
        leagueName: 'GBBL',
        eras: [
          {
            identity: { name: 'GBBL 1', rulesSets: ['BB2016'] },
            dates: {
              startDate: '2019-08-03',
              endDate: '2019-11-13',
              autoAssignByDate: false,
            },
            players: { autoAssignByPlayerId: false },
            competitions: { seasonCompetitionIdOverrides: ['55'] },
            teams: { teamCodeOverrides: ['fes2'] },
          },
        ],
      },
    ];
    const eras = makeServiceForLeagues(leagues).getEras();
    expect(eras).toHaveLength(2);
    expect(eras[0].identity.name).toBe('First era');
    expect(eras[0].leagueName).toBe('tLoEG');
    expect(eras[1].identity.name).toBe('GBBL 1');
    expect(eras[1].leagueName).toBe('GBBL');
  });

  it('throws when a league entry has an empty leagueName', () => {
    const leagues = [
      {
        leagueName: '',
        eras: [
          {
            identity: { name: 'First era', rulesSets: ['BB2016'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: { firstPlayerId: 1, autoAssignByPlayerId: true },
          },
        ],
      },
    ];
    expect(() => makeServiceForLeagues(leagues).getEras()).toThrow(
      'leagues[0].leagueName',
    );
  });

  it('rejects the same era name used in more than one league', () => {
    const leagues = [
      {
        leagueName: 'tLoEG',
        eras: [
          {
            identity: { name: 'Shared', rulesSets: ['BB2016'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: { firstPlayerId: 1, autoAssignByPlayerId: true },
          },
        ],
      },
      {
        leagueName: 'GBBL',
        eras: [
          {
            identity: { name: 'Shared', rulesSets: ['BB2016'] },
            dates: { startDate: '2019-08-03', autoAssignByDate: false },
            players: { autoAssignByPlayerId: false },
            teams: { teamCodeOverrides: ['fes2'] },
          },
        ],
      },
    ];
    expect(() => makeServiceForLeagues(leagues).getEras()).toThrow(/Shared/);
  });

  it('throws when an entry has an empty name', () => {
    const eras = [
      {
        identity: { name: '', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('identity.name');
  });

  it('throws when an entry has an empty rulesSets array', () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: [] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('identity.rulesSets');
  });

  it('accepts an era spanning multiple rules sets', () => {
    const eras = [
      {
        identity: {
          name: 'Living rulebook',
          rulesSets: ['CRP', 'CRP+', 'BB2016'],
        },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 1000,
          autoAssignByPlayerId: true,
        },
      },
    ];
    expect(makeService(eras).getEras()[0].identity.rulesSets).toEqual([
      'CRP',
      'CRP+',
      'BB2016',
    ]);
  });

  it('throws when startDate is not a real calendar date', () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-02-30', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('dates.startDate');
  });

  it('throws when endDate is present but not an ISO date', () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: {
          startDate: '2021-09-01',
          endDate: 'later',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('dates.endDate');
  });

  it('throws when autoAssignByDate is missing or not a boolean', () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01' },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('dates.autoAssignByDate');
  });

  it('throws when autoAssignByPlayerId is missing or not a boolean', () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1 },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      'players.autoAssignByPlayerId',
    );
  });

  it('requires firstPlayerId when autoAssignByPlayerId is true', () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { autoAssignByPlayerId: true },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('players.firstPlayerId');
  });

  it('allows firstPlayerId/lastPlayerId to be omitted when autoAssignByPlayerId is false', () => {
    const eras = [
      {
        identity: { name: 'Stunty', rulesSets: ['CRP'] },
        dates: {
          startDate: '2016-03-12',
          endDate: '2016-11-26',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        teams: { teamCodeOverrides: ['rad'] },
      },
    ];
    const era = makeService(eras).getEras()[0];
    expect(era.players.firstPlayerId).toBeUndefined();
    expect(era.players.lastPlayerId).toBeUndefined();
    expect(era.players.autoAssignByPlayerId).toBe(false);
    expect(era.dates.endDate).toBe('2016-11-26');
  });

  it('validates firstPlayerId when present even though autoAssignByPlayerId is false', () => {
    const eras = [
      {
        identity: { name: 'Stunty', rulesSets: ['CRP'] },
        dates: {
          startDate: '2016-03-12',
          endDate: '2016-11-26',
          autoAssignByDate: false,
        },
        players: { firstPlayerId: 0, autoAssignByPlayerId: false },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('players.firstPlayerId');
  });

  it('rejects a non-integer lastPlayerId', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 1.5,
          autoAssignByPlayerId: true,
        },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('players.lastPlayerId');
  });

  it('rejects firstPlayerId greater than lastPlayerId', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: {
          firstPlayerId: 10,
          lastPlayerId: 5,
          autoAssignByPlayerId: true,
        },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('players.firstPlayerId');
  });

  it('rejects lastPlayerId set without firstPlayerId', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: false },
        players: { lastPlayerId: 5, autoAssignByPlayerId: false },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('players.lastPlayerId');
  });

  it('parses playerIdOverrides when present, leaving it undefined when absent', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
          playerIdOverrides: [4907, 4909],
        },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].players.playerIdOverrides).toEqual([4907, 4909]);
    expect(result[1].players.playerIdOverrides).toBeUndefined();
  });

  it('rejects playerIdOverrides containing a non-positive-integer', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: {
          firstPlayerId: 1,
          autoAssignByPlayerId: true,
          playerIdOverrides: [4907, 0],
        },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      'players.playerIdOverrides',
    );
  });

  it('rejects the same pid overridden into more than one era', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
          playerIdOverrides: [4907],
        },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: {
          firstPlayerId: 5001,
          autoAssignByPlayerId: true,
          playerIdOverrides: [4907],
        },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/4907/);
  });

  it('parses competitions overrides when present, leaving the group undefined when absent', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
        competitions: {
          seasonCompetitionIdOverrides: ['74'],
          cupCompetitionIdOverrides: ['30', '33'],
        },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].competitions?.seasonCompetitionIdOverrides).toEqual([
      '74',
    ]);
    expect(result[0].competitions?.cupCompetitionIdOverrides).toEqual([
      '30',
      '33',
    ]);
    expect(result[1].competitions).toBeUndefined();
  });

  it('rejects seasonCompetitionIdOverrides containing a non-string or empty string', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: { seasonCompetitionIdOverrides: ['74', ''] },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      'competitions.seasonCompetitionIdOverrides',
    );
  });

  it('rejects the same competition id across season and cup overrides in different eras', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
        competitions: { seasonCompetitionIdOverrides: ['30'] },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { cupCompetitionIdOverrides: ['30'] },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/30/);
  });

  it('parses teamCodeOverrides when present, leaving the group undefined when absent', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
        teams: { teamCodeOverrides: ['rad', 'sl-'] },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].teams?.teamCodeOverrides).toEqual(['rad', 'sl-']);
    expect(result[1].teams).toBeUndefined();
  });

  it('rejects the same team code overridden into more than one era', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
        teams: { teamCodeOverrides: ['rad'] },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        teams: { teamCodeOverrides: ['rad'] },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/rad/);
  });

  it('parses matches.merges when present, leaving the group undefined when absent', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
        matches: { merges: [['1061', '1062']] },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].matches?.merges).toEqual([['1061', '1062']]);
    expect(result[1].matches).toBeUndefined();
  });

  it('rejects a matches group whose merges is not an array', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: { merges: 'nope' },
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('matches.merges');
  });

  it('parses positions overrides when present, leaving it undefined when absent', () => {
    const eras = [
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
        positions: [{ positionId: '12', raceId: '3', available: false }],
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].positions).toEqual([
      { positionId: '12', raceId: '3', available: false },
    ]);
    expect(result[1].positions).toBeUndefined();
  });

  it('rejects a non-array positions', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: 'nope',
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('positions');
  });

  it('rejects a positions entry with a non-string positionId', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: [{ positionId: 12, raceId: '3', available: false }],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      'positions[0].positionId',
    );
  });

  it('rejects a positions entry with a non-string raceId', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: [{ positionId: '12', raceId: 3, available: false }],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('positions[0].raceId');
  });

  it('rejects a positions entry with a non-boolean available', () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: [{ positionId: '12', raceId: '3', available: 'no' }],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('positions[0].available');
  });
});
