import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchCategoryService } from './tp-match-category.service';
import { TpMatchesImportService } from './tp-matches-import.service';

const MATCH_DB_ID = 7;

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertMatchResult: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  classify?: TpMatchCategoryService['classify'];
}

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

async function makeService({
  bootstrap,
  upsertMatchResult,
  getTpSystemName = () => 'TP',
  classify = () => 'normal',
}: MakeServiceOptions): Promise<{
  service: TpMatchesImportService;
  importResults: MockProxy<ImportResultService>;
  categoryClassifier: MockProxy<TpMatchCategoryService>;
}> {
  const matchesImport = mock<MatchesImportService>();
  matchesImport.upsertMatchResult.mockImplementation(
    asProviderMethod(upsertMatchResult),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const categoryClassifier = mock<TpMatchCategoryService>();
  categoryClassifier.classify.mockImplementation(classify);
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchesImportService,
      { provide: MatchesImportService, useValue: matchesImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: ImportResultService, useValue: importResults },
      { provide: TpMatchCategoryService, useValue: categoryClassifier },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpMatchesImportService),
    importResults,
    categoryClassifier,
  };
}

function tpMatch(id: number, name: string): TpMatch {
  return {
    id,
    playedDate: new Date('2021-05-15T18:00:00Z'),
    name,
    homeTeamTpId: 1000 + id,
    awayTeamTpId: 2000 + id,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
    phaseType: 160,
    phaseOrder: 1,
    round: 1,
    winner: 'home',
  };
}

describe('TpMatchesImportService', () => {
  it('upserts every match across competitions with its competitionId, name, category and TP external id', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    await service.importMatches({
      matchesByCompetitionId: new Map([
        [10, [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')]],
        [20, [tpMatch(200, 'Day 1')]],
      ]),
      competitionTypesByCompetitionId: new Map([
        [10, 'season'],
        [20, 'cup'],
      ]),
    });

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(3);
    expect(errors).toEqual([]);
    expect(upsertMatchResult).toHaveBeenCalledTimes(3);
    expect(upsertMatchResult).toHaveBeenNthCalledWith(
      1,
      {
        competitionId: 10,
        playedAt: new Date('2021-05-15T18:00:00Z'),
        name: 'Round 1',
        category: 'normal',
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
        category: 'normal',
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
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    await service.importMatches({
      matchesByCompetitionId: new Map([
        [10, [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')]],
      ]),
      competitionTypesByCompetitionId: new Map([[10, 'season']]),
    });

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      errors.some((e) => e.message.includes('match 100 failed to upsert')),
    ).toBe(true);
    expect(upsertMatchResult).toHaveBeenCalledTimes(2);
  });

  it('imports nothing for a competition with an empty match list', async () => {
    const upsertMatchResult = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    await service.importMatches({
      matchesByCompetitionId: new Map([[10, []]]),
      competitionTypesByCompetitionId: new Map([[10, 'season']]),
    });

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([]);
    expect(upsertMatchResult).not.toHaveBeenCalled();
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertMatchResult = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP'] },
          message: 'network timeout',
        },
      }),
      upsertMatchResult,
    });

    await service.importMatches({
      matchesByCompetitionId: new Map([[10, [tpMatch(100, 'Round 1')]]]),
      competitionTypesByCompetitionId: new Map([[10, 'season']]),
    });

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP'] });
    expect(upsertMatchResult).not.toHaveBeenCalled();
  });

  it('returns a matchIdsByTpId map keyed by TP match id', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: MATCH_DB_ID });
    const { service } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    const { matchIdsByTpId } = await service.importMatches({
      matchesByCompetitionId: new Map([[500, [tpMatch(566088, 'Test Match')]]]),
      competitionTypesByCompetitionId: new Map([[500, 'season']]),
    });

    expect(matchIdsByTpId.get(566088)).toBe(MATCH_DB_ID);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const { service } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    const { result } = await service.importMatches({
      matchesByCompetitionId: new Map([[10, [tpMatch(100, 'Round 1')]]]),
      competitionTypesByCompetitionId: new Map([[10, 'season']]),
    });

    expect(result).toBe(CANNED_RESULT);
  });

  it("skips all of a competition's matches with one recorded error when its type is unknown", async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
    });

    await service.importMatches({
      matchesByCompetitionId: new Map([
        [10, [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')]],
      ]),
      competitionTypesByCompetitionId: new Map(),
    });

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(upsertMatchResult).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ competitionId: 10 });
  });

  it('skips one match with one recorded error when the classifier throws, importing the rest', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const classify = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('TP match 100: unmapped phase');
      })
      .mockReturnValue('normal');
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
      classify,
    });

    await service.importMatches({
      matchesByCompetitionId: new Map([
        [10, [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')]],
      ]),
      competitionTypesByCompetitionId: new Map([[10, 'season']]),
    });

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(upsertMatchResult).toHaveBeenCalledTimes(1);
    expect(errors.some((e) => e.message.includes('unmapped phase'))).toBe(true);
  });

  it("passes the competition type and every one of the competition's matches to the classifier", async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const classify = vi.fn().mockReturnValue('normal');
    const { service } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
      upsertMatchResult,
      classify,
    });
    const matches = [tpMatch(100, 'Round 1'), tpMatch(101, 'Round 2')];

    await service.importMatches({
      matchesByCompetitionId: new Map([[10, matches]]),
      competitionTypesByCompetitionId: new Map([[10, 'season']]),
    });

    expect(classify).toHaveBeenCalledWith({
      match: matches[0],
      competitionType: 'season',
      competitionMatches: matches,
    });
    expect(classify).toHaveBeenCalledWith({
      match: matches[1],
      competitionType: 'season',
      competitionMatches: matches,
    });
  });
});
