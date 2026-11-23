import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRosterCopyReaderService } from './tp-roster-copy-reader.service';

const SOURCE = 'fourth-era/tloegbbl-chaos-cup-8/rosters_164848.json';

function rosterFile(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: 164848, lineUps: [{ id: 2463398 }, { id: 99 }], ...overrides };
}

describe('TpRosterCopyReaderService', () => {
  let service: TpRosterCopyReaderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterCopyReaderService],
    }).compile();
    service = moduleRef.get(TpRosterCopyReaderService);
  });

  it('reads the era directory, roster id, players in numeric order and newest finish', () => {
    const content = rosterFile({
      lastMatches: [
        { scores: [{ finishInstant: '2026-02-24T19:14:21.4342804+00:00' }] },
        {
          scores: [
            { finishInstant: '2026-05-25T10:00:00+00:00' },
            { finishInstant: null },
          ],
        },
      ],
    });

    expect(service.read({ source: SOURCE, content })).toEqual({
      kind: 'copy',
      copy: {
        era: 'fourth-era',
        rosterId: '164848',
        source: SOURCE,
        finishedAt: Date.parse('2026-05-25T10:00:00Z'),
        playerIds: ['99', '2463398'],
      },
    });
  });

  it.each([
    ['no lastMatches', {}],
    ['an empty lastMatches', { lastMatches: [] }],
    [
      'only missing or unparseable instants',
      {
        lastMatches: [
          { scores: [] },
          { scores: [{ finishInstant: 'not a date' }] },
          {},
        ],
      },
    ],
    ['a malformed lastMatches', { lastMatches: 'oops' }],
  ])('has no finish instant with %s', (_name, overrides) => {
    const result = service.read({
      source: SOURCE,
      content: rosterFile(overrides),
    });

    expect(result.kind).toBe('copy');
    expect(result.kind === 'copy' && result.copy.finishedAt).toBeNull();
  });

  it('reports a file without a roster id as unreadable, located by its path', () => {
    const result = service.read({ source: SOURCE, content: { lineUps: [] } });

    expect(result).toMatchObject({
      kind: 'unreadable',
      location: { era: 'fourth-era', rosterId: '164848' },
    });
    expect(result.kind === 'unreadable' && result.reason).toContain('id');
  });

  it('reports a file that is not an object as unreadable at its root', () => {
    const result = service.read({ source: SOURCE, content: null });

    expect(result.kind === 'unreadable' && result.reason).toContain('(root)');
  });

  it('locates a copy by its era directory and the roster id in its name', () => {
    expect(service.locate(SOURCE)).toEqual({
      era: 'fourth-era',
      rosterId: '164848',
    });
  });

  it('falls back to the path for a name with no roster id', () => {
    expect(service.locate('e/odd.json')).toEqual({
      era: 'e',
      rosterId: 'e/odd.json',
    });
  });
});
