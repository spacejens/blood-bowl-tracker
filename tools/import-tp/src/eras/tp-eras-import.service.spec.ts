import type {
  ErasImportService,
  ExternalSystemBootstrapService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { TournamentParserService } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import type {
  EraDataConfig,
  EraDataConfigService,
} from './era-data-config.service';
import { TpErasImportService } from './tp-eras-import.service';

interface MakeServiceOptions {
  getEras: () => EraDataConfig[];
  files: () => AsyncIterable<TpSourceFile>;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertEra: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  getEras,
  files,
  bootstrap,
  upsertEra,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpErasImportService(
    { getEras } as unknown as EraDataConfigService,
    { upsertEra } as unknown as ErasImportService,
    { files } as unknown as TpSourceReader,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
    new TournamentParserService(),
    new NameExternalIdService(),
  );
}

function makeFiles(entries: TpSourceFile[]): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
  };
}

/**
 * Models TpSourceReader.files() throwing partway through iteration, e.g. when
 * a later era's configured data directory does not exist on disk.
 */
function makeFilesThatThrow(
  entries: TpSourceFile[],
  error: Error,
): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
    throw error;
  };
}

function tournamentFile(
  era: string,
  filename: string,
  ruleSet: number,
): TpSourceFile {
  return {
    era,
    competition: 'comp',
    type: 'tournament',
    filename,
    content: { id: 1, name: 'T', ruleSet },
  };
}

const eras: EraDataConfig[] = [
  {
    name: 'Third era',
    dataSubdir: 'third-era',
    rulesSets: ['LRB6'],
    startDate: '2013-01-01',
    endDate: '2016-12-31',
  },
  {
    name: 'Fourth era',
    dataSubdir: 'fourth-era',
    rulesSets: ['BB2020'],
    startDate: '2020-11-28',
  },
];

const rulesSetIds = new Map<string, number>([
  ['LRB6', 100],
  ['BB2020', 200],
]);

describe('TpErasImportService', () => {
  it('upserts each era with resolved rule-set ids and dates', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Third era' })
      .mockResolvedValueOnce({ id: 600, name: 'Fourth era' });
    const service = makeService({
      getEras: () => eras,
      files: makeFiles([
        tournamentFile('Third era', 'tournament_third-cup.json', 20),
        tournamentFile('Fourth era', 'tournament_fourth-cup.json', 25),
      ]),
      bootstrap,
      upsertEra,
    });

    const { result, eraIdsByName } = await service.importEras(10, rulesSetIds);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', isBookkeeping: false },
      { name: 'Name', isBookkeeping: true },
    ]);
    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(eraIdsByName).toEqual(
      new Map([
        ['Third era', 500],
        ['Fourth era', 600],
      ]),
    );
    expect(upsertEra).toHaveBeenNthCalledWith(
      1,
      {
        name: 'Third era',
        leagueId: 10,
        rulesSetIds: [100],
        startDate: '2013-01-01',
        endDate: '2016-12-31',
        externalIds: [
          { externalSystemId: 1, externalId: 'Third era' },
          { externalSystemId: 2, externalId: 'Third era' },
        ],
      },
      expect.any(Array),
    );
    expect(upsertEra).toHaveBeenNthCalledWith(
      2,
      {
        name: 'Fourth era',
        leagueId: 10,
        rulesSetIds: [200],
        startDate: '2020-11-28',
        endDate: undefined,
        externalIds: [
          { externalSystemId: 1, externalId: 'Fourth era' },
          { externalSystemId: 2, externalId: 'Fourth era' },
        ],
      },
      expect.any(Array),
    );
  });

  it('records one error and imports nothing when the league id is missing', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn();
    const service = makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(undefined, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('league'))).toBe(true);
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('skips an era whose rule set was not imported, recording an error', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const partialIds = new Map<string, number>([['LRB6', 100]]);
    const service = makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(10, partialIds);

    // Third era resolves (LRB6), Fourth era does not (BB2020 missing).
    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(upsertEra).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some(
        (e) => e.message.includes('Fourth era') && e.message.includes('BB2020'),
      ),
    ).toBe(true);
  });

  it('passes silently when one era directory reports a single rule-set code', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const service = makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        tournamentFile('Third era', 'tournament_a.json', 20),
        tournamentFile('Third era', 'tournament_b.json', 20),
        // A variant file (two underscores) must be ignored by the check.
        tournamentFile('Third era', 'tournament_a_coach-stats.json', 99),
      ]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(10, new Map([['LRB6', 100]]));

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('records an error but still upserts when an era directory reports mismatched codes', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const service = makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        tournamentFile('Third era', 'tournament_a.json', 20),
        tournamentFile('Third era', 'tournament_b.json', 21),
      ]),
      bootstrap,
      upsertEra,
    });

    const { result, eraIdsByName } = await service.importEras(
      10,
      new Map([['LRB6', 100]]),
    );

    expect(upsertEra).toHaveBeenCalledTimes(1);
    expect(eraIdsByName).toEqual(new Map([['Third era', 500]]));
    // Diagnostic error recorded, but the era still imported.
    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some(
        (e) => e.message.includes('Third era') && /20|21/.test(e.message),
      ),
    ).toBe(true);
  });

  it('records a diagnostic error but still upserts when a tournament file fails to parse', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const service = makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        {
          era: 'Third era',
          competition: 'comp',
          type: 'tournament',
          filename: 'tournament_broken.json',
          content: { id: 1, name: 'T' }, // missing ruleSet
        },
      ]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(10, new Map([['LRB6', 100]]));

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Third era'))).toBe(
      true,
    );
  });

  it('records one error but still upserts every era when the rule-set scan throws partway through', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Third era' })
      .mockResolvedValueOnce({ id: 600, name: 'Fourth era' });
    const service = makeService({
      getEras: () => eras,
      files: makeFilesThatThrow(
        [tournamentFile('Third era', 'tournament_third-cup.json', 20)],
        new Error(
          'Era data directory not found: /data/fourth-era (configured for era "Fourth era").',
        ),
      ),
      bootstrap,
      upsertEra,
    });

    const { result, eraIdsByName } = await service.importEras(10, rulesSetIds);

    // Both eras are still upserted from config even though the shared scan
    // aborted after the first era's files, since it errored on the second.
    expect(upsertEra).toHaveBeenCalledTimes(2);
    expect(eraIdsByName).toEqual(
      new Map([
        ['Third era', 500],
        ['Fourth era', 600],
      ]),
    );
    expect(result.imported).toBe(2);
    expect(result.success).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.message.includes('rule-set') &&
          e.message.includes('Era data directory not found'),
      ),
    ).toBe(true);
  });

  it('accumulates every parse failure for an era, not just the last one', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const service = makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        {
          era: 'Third era',
          competition: 'comp',
          type: 'tournament',
          filename: 'tournament_broken1.json',
          content: { id: 1, name: 'T1' }, // missing ruleSet
        },
        {
          era: 'Third era',
          competition: 'comp',
          type: 'tournament',
          filename: 'tournament_broken2.json',
          content: { id: 2, name: 'T2' }, // missing ruleSet
        },
      ]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(10, new Map([['LRB6', 100]]));

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.message.includes('tournament_broken1.json') &&
          e.message.includes('tournament_broken2.json'),
      ),
    ).toBe(true);
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
    const bootstrap = vi.fn();
    const upsertEra = vi.fn();
    const service = makeService({
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(10, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('TP_ERAS');
    expect(bootstrap).not.toHaveBeenCalled();
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertEra = vi.fn();
    const service = makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(10, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertEra).not.toHaveBeenCalled();
  });
});
