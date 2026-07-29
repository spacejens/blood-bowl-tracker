import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ImportBblConfigService } from '../config/import-bbl-config.service';
import { EraConfigService } from './era-config.service';

async function buildService(
  configuredLeagues: unknown,
): Promise<EraConfigService> {
  const config = mock<ImportBblConfigService>();
  config.get.mockImplementation((key: string) =>
    key === 'leagues' ? configuredLeagues : undefined,
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      EraConfigService,
      { provide: ImportBblConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(EraConfigService);
}

function makeService(eras: unknown): Promise<EraConfigService> {
  return buildService([{ leagueName: 'tLoEG', eras }]);
}

function makeServiceForLeagues(leagues: unknown): Promise<EraConfigService> {
  return buildService(leagues);
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
  it('parses a valid eras array, leaving an omitted endDate/lastPlayerId undefined', async () => {
    const service = await makeService(validEras);
    const eras = service.getEras();
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

  it('throws when leagues is not set', async () => {
    const service = await makeServiceForLeagues(undefined);
    expect(() => service.getEras()).toThrow(
      'leagues is not set in import-bbl-config.json5',
    );
  });

  it('throws when leagues is not a non-empty array', async () => {
    const service = await makeServiceForLeagues([]);
    expect(() => service.getEras()).toThrow('non-empty');
  });

  it('stamps each era with the name of the league it came from', async () => {
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
    const service = await makeServiceForLeagues(leagues);
    const eras = service.getEras();
    expect(eras).toHaveLength(2);
    expect(eras[0].identity.name).toBe('First era');
    expect(eras[0].leagueName).toBe('tLoEG');
    expect(eras[1].identity.name).toBe('GBBL 1');
    expect(eras[1].leagueName).toBe('GBBL');
  });

  it('throws when a league entry has an empty leagueName', async () => {
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
    const service = await makeServiceForLeagues(leagues);
    expect(() => service.getEras()).toThrow('leagues[0].leagueName');
  });

  it('rejects the same era name used in more than one league', async () => {
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
    const service = await makeServiceForLeagues(leagues);
    expect(() => service.getEras()).toThrow(/Shared/);
  });

  it('throws when an entry has an empty name', async () => {
    const eras = [
      {
        identity: { name: '', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('identity.name');
  });

  it('throws when an entry has an empty rulesSets array', async () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: [] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('identity.rulesSets');
  });

  it('accepts an era spanning multiple rules sets', async () => {
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
    const service = await makeService(eras);
    expect(service.getEras()[0].identity.rulesSets).toEqual([
      'CRP',
      'CRP+',
      'BB2016',
    ]);
  });

  it('throws when startDate is not a real calendar date', async () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-02-30', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('dates.startDate');
  });

  it('throws when endDate is present but not an ISO date', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('dates.endDate');
  });

  it('throws when autoAssignByDate is missing or not a boolean', async () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01' },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('dates.autoAssignByDate');
  });

  it('throws when autoAssignByPlayerId is missing or not a boolean', async () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1 },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.autoAssignByPlayerId');
  });

  it('requires firstPlayerId when autoAssignByPlayerId is true', async () => {
    const eras = [
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { autoAssignByPlayerId: true },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.firstPlayerId');
  });

  it('allows firstPlayerId/lastPlayerId to be omitted when autoAssignByPlayerId is false', async () => {
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
    const service = await makeService(eras);
    const era = service.getEras()[0];
    expect(era.players.firstPlayerId).toBeUndefined();
    expect(era.players.lastPlayerId).toBeUndefined();
    expect(era.players.autoAssignByPlayerId).toBe(false);
    expect(era.dates.endDate).toBe('2016-11-26');
  });

  it('validates firstPlayerId when present even though autoAssignByPlayerId is false', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.firstPlayerId');
  });

  it('rejects a non-integer lastPlayerId', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.lastPlayerId');
  });

  it('rejects firstPlayerId greater than lastPlayerId', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.firstPlayerId');
  });

  it('rejects lastPlayerId set without firstPlayerId', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: false },
        players: { lastPlayerId: 5, autoAssignByPlayerId: false },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.lastPlayerId');
  });

  it('parses playerIdOverrides when present, leaving it undefined when absent', async () => {
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
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].players.playerIdOverrides).toEqual([4907, 4909]);
    expect(result[1].players.playerIdOverrides).toBeUndefined();
  });

  it('rejects playerIdOverrides containing a non-positive-integer', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('players.playerIdOverrides');
  });

  it('rejects the same pid overridden into more than one era', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow(/4907/);
  });

  it('parses competitions overrides when present, leaving the group undefined when absent', async () => {
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
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].competitions?.seasonCompetitionIdOverrides).toEqual([
      '74',
    ]);
    expect(result[0].competitions?.cupCompetitionIdOverrides).toEqual([
      '30',
      '33',
    ]);
    expect(result[1].competitions).toBeUndefined();
  });

  it('rejects seasonCompetitionIdOverrides containing a non-string or empty string', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: { seasonCompetitionIdOverrides: ['74', ''] },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow(
      'competitions.seasonCompetitionIdOverrides',
    );
  });

  it('rejects the same competition id across season and cup overrides in different eras', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow(/30/);
  });

  it('parses teamCodeOverrides when present, leaving the group undefined when absent', async () => {
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
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].teams?.teamCodeOverrides).toEqual(['rad', 'sl-']);
    expect(result[1].teams).toBeUndefined();
  });

  it('rejects the same team code overridden into more than one era', async () => {
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
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow(/rad/);
  });

  it('parses matches.merges when present, leaving the group undefined when absent', async () => {
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
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].matches?.merges).toEqual([['1061', '1062']]);
    expect(result[1].matches).toBeUndefined();
  });

  it('rejects a matches group whose merges is not an array', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: { merges: 'nope' },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('matches.merges');
  });

  it('parses matches.categoryOverrides alongside merges', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: {
          merges: [['1', '2']],
          categoryOverrides: [{ matchId: '1', category: 'cup_final' }],
        },
      },
    ];
    const service = await makeService(eras);
    expect(service.getEras()[0].matches?.categoryOverrides).toEqual([
      { matchId: '1', category: 'cup_final' },
    ]);
  });

  it('allows a matches group with only categoryOverrides', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: {
          categoryOverrides: [{ matchId: '1', category: 'cup_final' }],
        },
      },
    ];
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].matches?.merges).toBeUndefined();
    expect(result[0].matches?.categoryOverrides).toEqual([
      { matchId: '1', category: 'cup_final' },
    ]);
  });

  it('rejects a non-array categoryOverrides', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: { categoryOverrides: 'nope' },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow(
      /matches\.categoryOverrides must be an array/,
    );
  });

  it('parses matches.resultOverrides alongside merges', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: {
          merges: [['1', '2']],
          resultOverrides: [{ matchId: '1', winnerTeamCode: 'sew' }],
        },
      },
    ];
    const service = await makeService(eras);
    expect(service.getEras()[0].matches?.resultOverrides).toEqual([
      { matchId: '1', winnerTeamCode: 'sew' },
    ]);
  });

  it('allows a matches group with only resultOverrides', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: {
          resultOverrides: [{ matchId: '1', winnerTeamCode: 'draw' }],
        },
      },
    ];
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].matches?.merges).toBeUndefined();
    expect(result[0].matches?.resultOverrides).toEqual([
      { matchId: '1', winnerTeamCode: 'draw' },
    ]);
  });

  it('rejects a non-array resultOverrides', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        matches: { resultOverrides: 'nope' },
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow(
      /matches\.resultOverrides must be an array/,
    );
  });

  it('parses positions overrides when present, leaving it undefined when absent', async () => {
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
    const service = await makeService(eras);
    const result = service.getEras();
    expect(result[0].positions).toEqual([
      { positionId: '12', raceId: '3', available: false },
    ]);
    expect(result[1].positions).toBeUndefined();
  });

  it('rejects a non-array positions', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: 'nope',
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('positions');
  });

  it('rejects a positions entry with a non-string positionId', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: [{ positionId: 12, raceId: '3', available: false }],
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('positions[0].positionId');
  });

  it('rejects a positions entry with a non-string raceId', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: [{ positionId: '12', raceId: 3, available: false }],
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('positions[0].raceId');
  });

  it('rejects a positions entry with a non-boolean available', async () => {
    const eras = [
      {
        identity: { name: 'LRB', rulesSets: ['LRB'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        positions: [{ positionId: '12', raceId: '3', available: 'no' }],
      },
    ];
    const service = await makeService(eras);
    expect(() => service.getEras()).toThrow('positions[0].available');
  });
});
