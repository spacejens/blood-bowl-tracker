import type { Dirent } from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
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

function writeRoster(rosterId: number, lineUps: unknown[]): void {
  writeFileSync(
    join(dir, 'fourth-era', 'season-30', `rosters_${rosterId}.json`),
    JSON.stringify({ lineUps }),
    'utf8',
  );
}

type EntriesFn = (dir: string) => Promise<Dirent[]>;

/**
 * Forces the service's directory scan to visit `targetDir`'s entries in
 * exactly `order`, regardless of what the real `readdir` call returns. The
 * production code relies on `readdir` order to break roster-conflict ties
 * (see `absorbRoster`), and that order is filesystem-dependent — write order
 * does not reliably control it (that's what let the bug this guards against
 * slip past the original, non-discriminating tests). Pinning the scan order
 * directly is the only portable way to exercise both directions of the
 * guard.
 */
function withOrderedEntries(
  targetService: TpRawPlayerIndexService,
  targetDir: string,
  order: string[],
): void {
  const proto = Object.getPrototypeOf(targetService) as { entries: EntriesFn };
  const original = proto.entries.bind(targetService) as EntriesFn;
  vi.spyOn(
    targetService as unknown as { entries: EntriesFn },
    'entries',
  ).mockImplementation(async (targetPath: string) => {
    const result = await original(targetPath);
    if (targetPath !== targetDir) {
      return result;
    }
    const byName = new Map(result.map((entry) => [entry.name, entry]));
    return order.map((name) => {
      const entry = byName.get(name);
      if (entry === undefined) {
        throw new Error(`entries() did not return ${name} for ${targetPath}`);
      }
      return entry;
    });
  });
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

describe('TpRawPlayerIndexService', () => {
  let service: TpRawPlayerIndexService;
  let config: MockProxy<ReviewPlayerConfigService>;

  beforeEach(async () => {
    config = mock<ReviewPlayerConfigService>();
    config.getDataDir.mockReturnValue(dir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRawPlayerIndexService,
        { provide: ReviewPlayerConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TpRawPlayerIndexService);
  });

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

    expect((await service.aggregateFor('2477481'))?.totalStarPlayerPoints).toBe(
      12,
    );
  });

  it('returns null for a line-up id that appears in no match file', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));

    expect(await service.aggregateFor('9999999')).toBeNull();
  });

  it('scans the mirror once however many players are asked for', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));

    await service.aggregateFor('2477481');
    await service.aggregateFor('2616372');
    await service.aggregateFor('2477481');

    // The config is read once per scan; a second scan would read it again.
    expect(config.getDataDir).toHaveBeenCalledTimes(1);
  });

  it('ignores a malformed match file instead of failing the whole run', async () => {
    writeFileSync(
      join(dir, 'fourth-era', 'season-30', 'match_3.json'),
      '{ not json',
      'utf8',
    );
    writeMatch(1, matchFile({ lineUpTotal: 8, events: [] }));

    expect(await service.aggregateFor('2477481')).not.toBeNull();
  });

  it('returns null for every player when the data directory is absent', async () => {
    rmSync(dir, { recursive: true, force: true });

    expect(await service.aggregateFor('2477481')).toBeNull();
  });

  it('returns null for a non-numeric external id', async () => {
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

    expect(await service.aggregateFor('2477481')).toBeNull();
  });

  it('rethrows a directory-scan failure that is not a missing directory', async () => {
    // A directory nested one or more levels down (e.g. the season directory)
    // can't be used here: the code filters entries by isDirectory() before
    // recursing, so replacing it with a file just makes it get skipped, not
    // fail. Only the configured data dir itself is read without a prior
    // isDirectory() check, so replacing it with a file reliably produces an
    // ENOTDIR scan failure regardless of the process's user/permissions
    // (a chmod-based technique would not: it silently doesn't block access
    // when the test process runs as root).
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, 'not a directory', 'utf8');

    await expect(service.aggregateFor('2477481')).rejects.toThrow();
  });

  it('reads a player characteristics line from the roster file', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeRoster(500, [{ id: 2477481, ma: 6, st: 4, ag: 3, pa: 5, av: 10 }]);

    const player = await service.aggregateFor('2477481');

    expect(player).toMatchObject({
      move: 6,
      strength: 4,
      agility: 3,
      passing: 5,
      armour: 10,
    });
  });

  it('passes a raw TP pa 0 through as a real Passing value, not null', async () => {
    // Every rules set TP covers (BB2020, DB2021, BB2025) has a Passing
    // characteristic, so a raw pa of 0 always means "structurally cannot
    // pass" (a Kroxigor/Ogre) -- real data, never an absence marker -- and
    // must reach the raw-display panel unchanged, exactly like import-tp
    // already treats it.
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeRoster(500, [{ id: 2477481, ma: 4, st: 5, ag: 4, pa: 0, av: 10 }]);

    const player = await service.aggregateFor('2477481');

    expect(player?.passing).toBe(0);
  });

  it('leaves characteristics null for a player no roster file carries', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));

    const player = await service.aggregateFor('2477481');

    expect(player).toMatchObject({
      move: null,
      strength: null,
      agility: null,
      passing: null,
      armour: null,
    });
  });

  it('ignores a roster entry with no readable characteristics line', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeRoster(500, [{ id: 2477481, name: 'no stats here' }]);

    const player = await service.aggregateFor('2477481');

    expect(player?.move).toBeNull();
  });

  it('ignores roster characteristics for a line-up id no match file mentions', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeRoster(500, [{ id: 999999, ma: 6, st: 3, ag: 3, pa: 4, av: 9 }]);

    expect(await service.aggregateFor('999999')).toBeNull();
  });

  it('takes the higher-numbered roster file when it is scanned after the lower one', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeRoster(500, [{ id: 2477481, ma: 6, st: 4, ag: 3, pa: 5, av: 10 }]);
    writeRoster(700, [{ id: 2477481, ma: 8, st: 2, ag: 5, pa: 3, av: 9 }]);
    withOrderedEntries(service, join(dir, 'fourth-era', 'season-30'), [
      'match_1.json',
      'rosters_500.json',
      'rosters_700.json',
    ]);

    const player = await service.aggregateFor('2477481');

    expect(player).toMatchObject({
      move: 8,
      strength: 2,
      agility: 5,
      passing: 3,
      armour: 9,
    });
  });

  it('keeps the higher-numbered roster file when it is scanned before the lower one', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeRoster(500, [{ id: 2477481, ma: 6, st: 4, ag: 3, pa: 5, av: 10 }]);
    writeRoster(700, [{ id: 2477481, ma: 8, st: 2, ag: 5, pa: 3, av: 9 }]);
    withOrderedEntries(service, join(dir, 'fourth-era', 'season-30'), [
      'match_1.json',
      'rosters_700.json',
      'rosters_500.json',
    ]);

    const player = await service.aggregateFor('2477481');

    expect(player).toMatchObject({
      move: 8,
      strength: 2,
      agility: 5,
      passing: 3,
      armour: 9,
    });
  });

  it('skips a malformed roster file rather than failing the scan', async () => {
    writeMatch(1, matchFile({ lineUpTotal: 7, events: [] }));
    writeFileSync(
      join(dir, 'fourth-era', 'season-30', 'rosters_500.json'),
      'not json at all',
      'utf8',
    );

    const player = await service.aggregateFor('2477481');

    expect(player?.move).toBeNull();
  });
});
