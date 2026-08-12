import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { TpRawPlayerIndexService } from './tp-raw-player-index.service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-player-tp-'));
  mkdirSync(join(dir, 'fourth-era', 'season-30'), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeMatch(matchId: number, body: unknown): void {
  writeFileSync(
    join(dir, 'fourth-era', 'season-30', `match_${matchId}.json`),
    JSON.stringify(body),
    'utf8',
  );
}

function matchFile(options: {
  lineUpTotal: number;
  events: { lineUpId?: number; matchEventType: number; starPoints?: number }[];
}) {
  return {
    inscriptionLocal: {
      roster: {
        lineUps: [
          {
            id: 2477481,
            name: 'Hubert Hårdråde',
            position: 'Flesh Golem',
            totalStarPlayerPoints: options.lineUpTotal,
          },
        ],
      },
    },
    inscriptionVisitor: {
      roster: {
        lineUps: [
          {
            id: 2616372,
            name: 'Grim Ironjaw',
            position: 'Blitzer',
            totalStarPlayerPoints: 5,
          },
        ],
      },
    },
    matchEvents: options.events,
  };
}

async function makeService(): Promise<TpRawPlayerIndexService> {
  const config = mock<ReviewPlayerConfigService>();
  config.getDataDir.mockReturnValue(dir);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRawPlayerIndexService,
      { provide: ReviewPlayerConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(TpRawPlayerIndexService);
}

describe('TpRawPlayerIndexService', () => {
  it('aggregates a player across every match file they appear in', async () => {
    writeMatch(
      1,
      matchFile({
        lineUpTotal: 8,
        events: [
          { lineUpId: 2477481, matchEventType: 4, starPoints: 3 },
          { lineUpId: 2477481, matchEventType: 7, starPoints: 4 },
          { lineUpId: 2616372, matchEventType: 4, starPoints: 3 },
          { matchEventType: 10 },
        ],
      }),
    );
    writeMatch(
      2,
      matchFile({
        lineUpTotal: 12,
        events: [{ lineUpId: 2477481, matchEventType: 4, starPoints: 3 }],
      }),
    );
    const service = await makeService();

    const aggregate = await service.aggregateFor('2477481');

    expect(aggregate).toMatchObject({
      lineUpId: 2477481,
      name: 'Hubert Hårdråde',
      position: 'Flesh Golem',
      starPointsFromEvents: 10,
      matchCount: 2,
    });
    expect(aggregate?.eventCounts.get(4)).toBe(2);
    expect(aggregate?.eventCounts.get(7)).toBe(1);
  });

  it('takes the reported total from the highest match id the player appears in', async () => {
    writeMatch(2, matchFile({ lineUpTotal: 12, events: [] }));
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));
    const service = await makeService();

    expect((await service.aggregateFor('2477481'))?.totalStarPlayerPoints).toBe(
      12,
    );
  });

  it('returns null for a line-up id that appears in no match file', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));
    const service = await makeService();

    expect(await service.aggregateFor('9999999')).toBeNull();
  });

  it('scans the mirror once however many players are asked for', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));
    const service = await makeService();

    await service.aggregateFor('2477481');
    await service.aggregateFor('2616372');

    // The config is read once per scan; a second scan would read it again.
    expect(await service.aggregateFor('2477481')).not.toBeNull();
  });

  it('ignores a malformed match file instead of failing the whole run', async () => {
    writeFileSync(
      join(dir, 'fourth-era', 'season-30', 'match_3.json'),
      '{ not json',
      'utf8',
    );
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));
    const service = await makeService();

    expect(await service.aggregateFor('2477481')).not.toBeNull();
  });

  it('returns null for every player when the data directory is absent', async () => {
    rmSync(dir, { recursive: true, force: true });
    const service = await makeService();

    expect(await service.aggregateFor('2477481')).toBeNull();
  });

  it('returns null for a non-numeric external id', async () => {
    const service = await makeService();

    expect(await service.aggregateFor('not-a-number')).toBeNull();
  });

  it('ignores a subdirectory and a non-match file inside a competition folder', async () => {
    mkdirSync(join(dir, 'fourth-era', 'season-30', 'nested'));
    writeFileSync(
      join(dir, 'fourth-era', 'season-30', 'notes.txt'),
      'not a match file',
      'utf8',
    );
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));
    const service = await makeService();

    expect(await service.aggregateFor('2477481')).not.toBeNull();
  });

  it('ignores a line-up entry missing an id or a name', async () => {
    writeMatch(1, {
      inscriptionLocal: {
        roster: { lineUps: [{ position: 'Flesh Golem' }] },
      },
      inscriptionVisitor: { roster: { lineUps: [] } },
      matchEvents: [],
    });
    const service = await makeService();

    expect(await service.aggregateFor('2477481')).toBeNull();
  });

  it('falls back to unknown position and a null total when the current match omits them', async () => {
    writeMatch(1, {
      inscriptionLocal: {
        roster: { lineUps: [{ id: 2477481, name: 'Hubert Hårdråde' }] },
      },
      inscriptionVisitor: { roster: { lineUps: [] } },
      matchEvents: [],
    });
    const service = await makeService();

    const aggregate = await service.aggregateFor('2477481');

    expect(aggregate).toMatchObject({
      position: 'unknown',
      totalStarPlayerPoints: null,
    });
  });

  it('skips updating a player from a match id lower than the latest already seen', async () => {
    writeMatch(10, matchFile({ lineUpTotal: 12, events: [] }));
    writeMatch(2, {
      inscriptionLocal: {
        roster: { lineUps: [{ id: 2477481, name: 'Someone Else' }] },
      },
      inscriptionVisitor: { roster: { lineUps: [] } },
      matchEvents: [],
    });
    const service = await makeService();

    const aggregate = await service.aggregateFor('2477481');

    expect(aggregate).toMatchObject({
      name: 'Hubert Hårdråde',
      totalStarPlayerPoints: 12,
    });
  });

  it('ignores match events missing a numeric event type or star points', async () => {
    writeMatch(
      1,
      matchFile({
        lineUpTotal: 8,
        events: [{ lineUpId: 2477481, matchEventType: 4 }],
      }),
    );
    const service = await makeService();

    const aggregate = await service.aggregateFor('2477481');

    expect(aggregate?.starPointsFromEvents).toBe(0);
    expect(aggregate?.eventCounts.get(4)).toBe(1);
  });

  it('treats a non-array lineUps or matchEvents property as empty', async () => {
    writeMatch(1, {
      inscriptionLocal: { roster: { lineUps: 'nope' } },
      inscriptionVisitor: { roster: { lineUps: [] } },
      matchEvents: 'nope',
    });
    const service = await makeService();

    expect(await service.aggregateFor('2477481')).toBeNull();
  });

  it('rethrows a directory-scan failure that is not a missing directory', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));
    const seasonDir = join(dir, 'fourth-era', 'season-30');
    chmodSync(seasonDir, 0o000);
    const service = await makeService();

    try {
      await expect(service.aggregateFor('2477481')).rejects.toThrow();
    } finally {
      chmodSync(seasonDir, 0o755);
    }
  });
});
