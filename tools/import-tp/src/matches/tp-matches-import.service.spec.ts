import type {
  ExternalSystemBootstrapService,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchesImportService } from './tp-matches-import.service';

const MATCH_DB_ID = 7;

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertMatchResult: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  bootstrap,
  upsertMatchResult,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpMatchesImportService(
    { upsertMatchResult } as unknown as MatchesImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

function tpMatch(id: number, name: string): TpMatch {
  return {
    id,
    playedDate: new Date('2021-05-15T18:00:00Z'),
    name,
    homeTeamTpId: 1000 + id,
    awayTeamTpId: 2000 + id,
    matchEvents: [],
  };
}

describe('TpMatchesImportService', () => {
  it('upserts every match across competitions with its competitionId, name and TP external id', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const service = makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    const { result } = await service.importMatches(
      new Map([
        [10, [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')]],
        [20, [tpMatch(200, 'Day 1')]],
      ]),
    );

    expect(result.imported).toBe(3);
    expect(result.success).toBe(true);
    expect(upsertMatchResult).toHaveBeenCalledTimes(3);
    expect(upsertMatchResult).toHaveBeenNthCalledWith(
      1,
      {
        competitionId: 10,
        playedAt: new Date('2021-05-15T18:00:00Z'),
        name: 'Round 1',
        externalIds: [{ externalSystemId: 1, externalId: '100' }],
        teamEraIds: [],
      },
      expect.any(Array),
    );
    expect(upsertMatchResult).toHaveBeenNthCalledWith(
      3,
      {
        competitionId: 20,
        playedAt: new Date('2021-05-15T18:00:00Z'),
        name: 'Day 1',
        externalIds: [{ externalSystemId: 1, externalId: '200' }],
        teamEraIds: [],
      },
      expect.any(Array),
    );
  });

  it('records a single match upsert failure without aborting the rest', async () => {
    const upsertMatchResult = vi
      .fn()
      .mockImplementationOnce(
        (_data, errors: { item: unknown; message: string }[]) => {
          errors.push({ item: {}, message: 'match 100 failed to upsert' });
          return Promise.resolve(undefined);
        },
      )
      .mockResolvedValue({ id: 7 });
    const service = makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    const { result } = await service.importMatches(
      new Map([[10, [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')]]]),
    );

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) =>
        e.message.includes('match 100 failed to upsert'),
      ),
    ).toBe(true);
    expect(upsertMatchResult).toHaveBeenCalledTimes(2);
  });

  it('imports nothing for a competition with an empty match list', async () => {
    const upsertMatchResult = vi.fn();
    const service = makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    const { result } = await service.importMatches(new Map([[10, []]]));

    expect(result.imported).toBe(0);
    expect(result.success).toBe(true);
    expect(upsertMatchResult).not.toHaveBeenCalled();
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertMatchResult = vi.fn();
    const service = makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP'] },
          message: 'network timeout',
        },
      }),
      upsertMatchResult,
    });

    const { result } = await service.importMatches(
      new Map([[10, [tpMatch(100, 'Round 1')]]]),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP'] });
    expect(upsertMatchResult).not.toHaveBeenCalled();
  });

  it('returns a matchIdsByTpId map keyed by TP match id', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: MATCH_DB_ID });
    const service = makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    const { matchIdsByTpId } = await service.importMatches(
      new Map([[500, [tpMatch(566088, 'Test Match')]]]),
    );

    expect(matchIdsByTpId.get(566088)).toBe(MATCH_DB_ID);
  });
});
