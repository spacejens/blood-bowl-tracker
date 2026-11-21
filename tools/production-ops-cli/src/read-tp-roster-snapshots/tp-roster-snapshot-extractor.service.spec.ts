import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRosterSnapshotExtractorService } from './tp-roster-snapshot-extractor.service';

/** Alv Svensson as a match embeds him: Block (96) plus two more skills. */
function lineUp(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 2104643,
    lineUpMasterId: 288,
    position: 'Blitzer',
    level: 1,
    skills: [
      { skillMasterId: 107 },
      { skillMasterId: 92 },
      { skillMasterId: 96 },
    ],
    totalStarPlayerPoints: 12,
    starPlayerPoints: 9,
    state: 4608,
    ...overrides,
  };
}

function matchFile(home: unknown[], away: unknown[] = []): unknown {
  return {
    matchId: 1,
    inscriptionLocal: { roster: { id: 10, lineUps: home } },
    inscriptionVisitor: { roster: { id: 11, lineUps: away } },
  };
}

const STATE = {
  lineUpMasterId: 288,
  level: 1,
  skillMasterIds: [92, 96, 107],
  totalSpp: 12,
  unspentSpp: 9,
};

describe('TpRosterSnapshotExtractorService', () => {
  let service: TpRosterSnapshotExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterSnapshotExtractorService],
    }).compile();
    service = moduleRef.get(TpRosterSnapshotExtractorService);
  });

  it("reads both sides of a match, each player's skills in ascending order", () => {
    expect(
      service.extract({
        kind: 'match',
        source: 'era/comp/match_1.json',
        content: matchFile([lineUp()], [lineUp({ id: 7, skills: [] })]),
      }),
    ).toEqual({
      kind: 'observations',
      observations: [
        { playerId: '2104643', source: 'era/comp/match_1.json', state: STATE },
        {
          playerId: '7',
          source: 'era/comp/match_1.json',
          state: { ...STATE, skillMasterIds: [] },
        },
      ],
    });
  });

  it("adds a roster entry's position skills to its own, as a match lists them", () => {
    const entry = {
      ...lineUp({ skills: [{ skillMasterId: 136 }, { skillMasterId: 99 }] }),
      lineUpMaster: { skills: [{ skillMasterId: 96 }] },
    };

    expect(
      service.extract({
        kind: 'roster',
        source: 'era/comp/rosters_5.json',
        content: { lineUps: [entry] },
      }),
    ).toEqual({
      kind: 'observations',
      observations: [
        {
          playerId: '2104643',
          source: 'era/comp/rosters_5.json',
          state: { ...STATE, skillMasterIds: [96, 99, 136] },
        },
      ],
    });
  });

  it('reads a roster entry with no position template by its own skills', () => {
    const result = service.extract({
      kind: 'roster',
      source: 'r.json',
      content: { lineUps: [lineUp({ skills: [{ skillMasterId: 99 }] })] },
    });

    expect(result).toEqual({
      kind: 'observations',
      observations: [
        {
          playerId: '2104643',
          source: 'r.json',
          state: { ...STATE, skillMasterIds: [99] },
        },
      ],
    });
  });

  it('keeps a skill id listed twice', () => {
    const result = service.extract({
      kind: 'match',
      source: 'm.json',
      content: matchFile([
        lineUp({ skills: [{ skillMasterId: 96 }, { skillMasterId: 96 }] }),
      ]),
    });

    expect(result).toEqual({
      kind: 'observations',
      observations: [
        {
          playerId: '2104643',
          source: 'm.json',
          state: { ...STATE, skillMasterIds: [96, 96] },
        },
      ],
    });
  });

  it('reports a match file of another shape as unreadable, naming the field', () => {
    const result = service.extract({
      kind: 'match',
      source: 'm.json',
      content: { matchId: 1 },
    });

    expect(result.kind).toBe('unreadable');
    expect(result.kind === 'unreadable' && result.reason).toContain(
      'inscriptionLocal',
    );
  });

  it('reports a roster entry with an unreadable level as unreadable', () => {
    const result = service.extract({
      kind: 'roster',
      source: 'r.json',
      content: { lineUps: [lineUp({ level: 'x' })] },
    });

    expect(result.kind).toBe('unreadable');
    expect(result.kind === 'unreadable' && result.reason).toContain(
      'lineUps.0.level',
    );
  });
});
