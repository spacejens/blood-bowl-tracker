import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpRosterSnapshotObservation } from './tp-roster-snapshot-extractor.service';
import { TpRosterSnapshotIndexService } from './tp-roster-snapshot-index.service';

const STATE = {
  lineUpMasterId: 288,
  level: 1,
  skillMasterIds: [92, 96, 107],
  totalSpp: 12,
  unspentSpp: 9,
};

function seen(
  playerId: string,
  source: string,
  state = STATE,
): TpRosterSnapshotObservation {
  return { playerId, source, state };
}

describe('TpRosterSnapshotIndexService', () => {
  let service: TpRosterSnapshotIndexService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterSnapshotIndexService],
    }).compile();
    service = moduleRef.get(TpRosterSnapshotIndexService);
  });

  it('merges identical states of a player, naming each source once, sorted', () => {
    expect(
      service.build({
        observations: [
          seen('5', 'b/match_2.json'),
          seen('5', 'a/match_1.json', {
            ...STATE,
            skillMasterIds: [92, 96, 107],
          }),
          seen('5', 'a/match_1.json'),
        ],
        unreadable: [],
      }),
    ).toEqual({
      players: {
        '5': [{ ...STATE, sources: ['a/match_1.json', 'b/match_2.json'] }],
      },
      conflicts: [],
      unreadable: [],
    });
  });

  it('keeps every distinct state of a player and lists him as a conflict', () => {
    const later = { ...STATE, totalSpp: 14, unspentSpp: 11 };
    const snapshots = service.build({
      observations: [seen('5', 'b.json', later), seen('5', 'a.json')],
      unreadable: [],
    });

    expect(snapshots.players['5']).toEqual([
      { ...STATE, sources: ['a.json'] },
      { ...later, sources: ['b.json'] },
    ]);
    expect(snapshots.conflicts).toEqual(['5']);
  });

  it('orders players and conflicts by numeric id', () => {
    const other = { ...STATE, level: 2 };
    const snapshots = service.build({
      observations: [
        seen('10', 'a.json'),
        seen('10', 'b.json', other),
        seen('9', 'a.json'),
        seen('9', 'b.json', other),
      ],
      unreadable: [],
    });

    expect(Object.keys(snapshots.players)).toEqual(['9', '10']);
    expect(snapshots.conflicts).toEqual(['9', '10']);
  });

  it('lists unreadable files by source', () => {
    expect(
      service.build({
        observations: [],
        unreadable: [
          { source: 'b.json', reason: 'x' },
          { source: 'a.json', reason: 'y' },
        ],
      }).unreadable,
    ).toEqual([
      { source: 'a.json', reason: 'y' },
      { source: 'b.json', reason: 'x' },
    ]);
  });
});
