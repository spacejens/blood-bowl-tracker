import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpRosterCopy } from './tp-roster-copy-reader.service';
import { TpRosterCopySelectionService } from './tp-roster-copy-selection.service';

function copy(
  competition: string,
  finishedAt: number | null,
  playerIds: string[],
): TpRosterCopy {
  const rosterId = '164848';
  return {
    era: 'fourth-era',
    rosterId,
    source: `fourth-era/${competition}/rosters_${rosterId}.json`,
    finishedAt,
    playerIds,
  };
}

describe('TpRosterCopySelectionService', () => {
  let service: TpRosterCopySelectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterCopySelectionService],
    }).compile();
    service = moduleRef.get(TpRosterCopySelectionService);
  });

  it('picks the copy whose newest match finished last, and names who only older copies list', () => {
    expect(
      service.select({
        copies: [
          copy('chaos-cup-8', 100, ['1', '2463398']),
          copy('sasong-30', 300, ['1', '5']),
          copy('sasong-29', 200, ['7']),
        ],
        unreadable: [],
      }),
    ).toEqual([
      {
        era: 'fourth-era',
        rosterId: '164848',
        chosen: ['fourth-era/sasong-30/rosters_164848.json'],
        listed: ['1', '5'],
        listedElsewhere: ['7', '2463398'],
      },
    ]);
  });

  it('counts a copy with no finish instant as older than any with one', () => {
    const [group] = service.select({
      copies: [copy('a', null, ['1']), copy('b', 5, ['2'])],
      unreadable: [],
    });

    expect(group.chosen).toEqual(['fourth-era/b/rosters_164848.json']);
    expect(group.listed).toEqual(['2']);
  });

  it('keeps every tied copy and lists only the players all of them list', () => {
    const [group] = service.select({
      copies: [copy('b', 5, ['1', '2']), copy('a', 5, ['2', '3'])],
      unreadable: [],
    });

    expect(group.chosen).toEqual([
      'fourth-era/a/rosters_164848.json',
      'fourth-era/b/rosters_164848.json',
    ]);
    expect(group.listed).toEqual(['2']);
    expect(group.listedElsewhere).toEqual(['1', '3']);
  });

  it('ties copies that both have no finish instant', () => {
    const [group] = service.select({
      copies: [copy('a', null, ['1']), copy('b', null, ['1'])],
      unreadable: [],
    });

    expect(group.chosen).toHaveLength(2);
    expect(group.listed).toEqual(['1']);
  });

  it('leaves a group with an unreadable copy undetermined', () => {
    expect(
      service.select({
        copies: [copy('a', 5, ['2', '1'])],
        unreadable: [{ era: 'fourth-era', rosterId: '164848' }],
      }),
    ).toEqual([
      {
        era: 'fourth-era',
        rosterId: '164848',
        chosen: [],
        listed: [],
        listedElsewhere: ['1', '2'],
      },
    ]);
  });

  it('keeps a group whose only copy is unreadable, empty', () => {
    expect(
      service.select({
        copies: [],
        unreadable: [{ era: 'third-era', rosterId: '9' }],
      }),
    ).toEqual([
      {
        era: 'third-era',
        rosterId: '9',
        chosen: [],
        listed: [],
        listedElsewhere: [],
      },
    ]);
  });

  it('groups by era directory and roster id, ordered by era then numeric roster id', () => {
    const groups = service.select({
      copies: [
        { ...copy('a', 1, ['1']), rosterId: '10' },
        { ...copy('a', 1, ['2']), rosterId: '9' },
        { ...copy('a', 1, ['3']), rosterId: '9', era: 'third-era' },
      ],
      unreadable: [],
    });

    expect(groups.map((g) => [g.era, g.rosterId])).toEqual([
      ['fourth-era', '9'],
      ['fourth-era', '10'],
      ['third-era', '9'],
    ]);
  });
});
