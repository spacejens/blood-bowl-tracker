import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import type { TpTournament } from '@blood-bowl-tracker/parse-tp';
import { TournamentParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  curatedEra,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import type { EraDataConfig } from './era-data-config.service';
import { EraDataConfigService } from './era-data-config.service';
import { TpErasImportService } from './tp-eras-import.service';

interface MakeServiceOptions {
  getEras: () => EraDataConfig[];
  files: () => AsyncIterable<TpSourceFile>;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertEra: ReturnType<typeof vi.fn>;
}

/**
 * The canned TpTournament the mocked TournamentParserService.parse returns.
 * The real Zod validation (including which fields are required and the
 * message it produces) is covered by
 * packages/parse-tp/src/tournament-parser.service.spec.ts; this spec only
 * needs parse() to succeed or fail on demand.
 */
const CANNED_TOURNAMENT: TpTournament = {
  id: 1,
  name: 'T',
  ruleSet: 20,
  phases: [],
  categoryIds: [],
};

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import-shared/src/import-result.service.spec.ts; this spec
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
  getEras,
  files,
  bootstrap,
  upsertEra,
}: MakeServiceOptions): Promise<{
  service: TpErasImportService;
  importResults: MockProxy<ImportResultService>;
  tournamentParser: MockProxy<TournamentParserService>;
}> {
  const eraDataConfig = mock<EraDataConfigService>();
  eraDataConfig.getEras.mockImplementation(getEras);
  const erasImport = mock<ErasImportService>();
  erasImport.upsert.mockImplementation(asProviderMethod(upsertEra));
  const sourceReader = mock<TpSourceReader>();
  sourceReader.files.mockImplementation(files);
  sourceReader.isBaseTournamentFile.mockImplementation((filename: string) =>
    /^tournament_[^_]+\.json$/.test(filename),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const tournamentParser = mock<TournamentParserService>();
  tournamentParser.parse.mockReturnValue(CANNED_TOURNAMENT);
  const nameExternalId = mockNameExternalIdService();
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import-shared/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpErasImportService,
      { provide: EraDataConfigService, useValue: eraDataConfig },
      { provide: ErasImportService, useValue: erasImport },
      { provide: TpSourceReader, useValue: sourceReader },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      { provide: TournamentParserService, useValue: tournamentParser },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpErasImportService),
    importResults,
    tournamentParser,
  };
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
  { name: 'Third era', dataSubdir: 'third-era' },
  { name: 'Fourth era', dataSubdir: 'fourth-era' },
];

const thirdEra = curatedEra({
  id: 500,
  name: 'Third era',
  rulesSetIds: [200],
  rulesSetNames: ['BB2020'],
  startDate: '2023-06-15',
  endDate: '2026-01-01',
});
const fourthEra = curatedEra({
  id: 600,
  name: 'Fourth era',
  rulesSetIds: [300],
  rulesSetNames: ['BB2025'],
  startDate: '2026-01-01',
  endDate: null,
});

describe('TpErasImportService', () => {
  it('attaches the TP id to each curated era, found by its Name id, sending nothing else', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce(thirdEra)
      .mockResolvedValueOnce(fourthEra);
    const { service, importResults } = await makeService({
      getEras: () => eras,
      files: makeFiles([
        tournamentFile('Third era', 'tournament_third-cup.json', 20),
        tournamentFile('Fourth era', 'tournament_fourth-cup.json', 25),
      ]),
      bootstrap,
      upsertEra,
    });

    await service.importEras();

    expect(bootstrap).toHaveBeenCalledWith([
      { name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
    expect(upsertEra).toHaveBeenNthCalledWith(
      1,
      {
        rulesSetIds: [],
        externalIds: [
          { externalSystemId: 2, externalId: 'Third era' },
          { externalSystemId: 1, externalId: 'Third era' },
        ],
      },
      expect.any(Array),
    );
    expect(upsertEra).toHaveBeenNthCalledWith(
      2,
      {
        rulesSetIds: [],
        externalIds: [
          { externalSystemId: 2, externalId: 'Fourth era' },
          { externalSystemId: 1, externalId: 'Fourth era' },
        ],
      },
      expect.any(Array),
    );
  });

  it('returns every upserted curated era keyed by its configured name', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce(thirdEra)
      .mockResolvedValueOnce(fourthEra);
    const { service } = await makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { erasByName } = await service.importEras();

    expect([...erasByName.entries()]).toEqual([
      ['Third era', thirdEra],
      ['Fourth era', fourthEra],
    ]);
  });

  it('leaves an era missing from the catalog out of the map, keeping only its upsert error', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const missingField = {
      item: { externalIds: [] },
      message: 'Failed to import era "Third era": name is required',
    };
    const upsertEra = vi
      .fn()
      .mockImplementationOnce((_data: unknown, errors: unknown[]) => {
        errors.push(missingField);
        return Promise.resolve(undefined);
      })
      .mockResolvedValueOnce(fourthEra);
    const { service, importResults } = await makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { erasByName } = await service.importEras();

    expect(upsertEra).toHaveBeenCalledTimes(2);
    expect(resultArgs(importResults)).toEqual({
      imported: 1,
      errors: [missingField],
    });
    expect([...erasByName.keys()]).toEqual(['Fourth era']);
  });

  it('passes silently when one era directory reports a single rule-set code', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const { service, importResults } = await makeService({
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

    await service.importEras();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('records an error but still upserts when an era directory reports mismatched codes', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const { service, importResults, tournamentParser } = await makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        tournamentFile('Third era', 'tournament_a.json', 20),
        tournamentFile('Third era', 'tournament_b.json', 21),
      ]),
      bootstrap,
      upsertEra,
    });
    tournamentParser.parse
      .mockReturnValueOnce({
        id: 1,
        name: 'T',
        ruleSet: 20,
        phases: [],
        categoryIds: [],
      })
      .mockReturnValueOnce({
        id: 1,
        name: 'T',
        ruleSet: 21,
        phases: [],
        categoryIds: [],
      });

    await service.importEras();

    expect(upsertEra).toHaveBeenCalledTimes(1);
    // Diagnostic error recorded, but the era still imported.
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      errors.some(
        (e) => e.message.includes('Third era') && /20|21/.test(e.message),
      ),
    ).toBe(true);
  });

  it('records a diagnostic error but still upserts when a tournament file fails to parse', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const { service, importResults, tournamentParser } = await makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        {
          era: 'Third era',
          competition: 'comp',
          type: 'tournament',
          filename: 'tournament_broken.json',
          content: { file: 'tournament_broken.json' },
        },
      ]),
      bootstrap,
      upsertEra,
    });
    tournamentParser.parse.mockImplementationOnce(() => {
      throw new Error('Invalid TP tournament JSON: missing ruleSet');
    });

    await service.importEras();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('Third era'))).toBe(true);
  });

  it('records one error but still upserts every era when the rule-set scan throws partway through', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Third era' })
      .mockResolvedValueOnce({ id: 600, name: 'Fourth era' });
    const { service, importResults } = await makeService({
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

    await service.importEras();

    // Both eras are still upserted from config even though the shared scan
    // aborted after the first era's files, since it errored on the second.
    expect(upsertEra).toHaveBeenCalledTimes(2);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(2);
    expect(
      errors.some(
        (e) =>
          e.message.includes('rule-set') &&
          e.message.includes('Era data directory not found'),
      ),
    ).toBe(true);
  });

  it('accumulates every parse failure for an era, not just the last one', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const { service, importResults, tournamentParser } = await makeService({
      getEras: () => [eras[0]],
      files: makeFiles([
        {
          era: 'Third era',
          competition: 'comp',
          type: 'tournament',
          filename: 'tournament_broken1.json',
          content: { file: 'tournament_broken1.json' },
        },
        {
          era: 'Third era',
          competition: 'comp',
          type: 'tournament',
          filename: 'tournament_broken2.json',
          content: { file: 'tournament_broken2.json' },
        },
      ]),
      bootstrap,
      upsertEra,
    });
    tournamentParser.parse
      .mockImplementationOnce(() => {
        throw new Error('Invalid TP tournament JSON: missing ruleSet');
      })
      .mockImplementationOnce(() => {
        throw new Error('Invalid TP tournament JSON: missing ruleSet');
      })
      .mockReturnValue(CANNED_TOURNAMENT);

    await service.importEras();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      errors.some(
        (e) =>
          e.message.includes('tournament_broken1.json') &&
          e.message.includes('tournament_broken2.json'),
      ),
    ).toBe(true);
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
    const bootstrap = vi.fn();
    const upsertEra = vi.fn();
    const { service, importResults } = await makeService({
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    await service.importEras();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(bootstrap).not.toHaveBeenCalled();
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: [TP_EXTERNAL_SYSTEM_NAME, 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertEra = vi.fn();
    const { service, importResults } = await makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    await service.importEras();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({
      externalSystems: [TP_EXTERNAL_SYSTEM_NAME, 'Name'],
    });
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Third era' })
      .mockResolvedValueOnce({ id: 600, name: 'Fourth era' });
    const { service } = await makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras();

    expect(result).toBe(CANNED_RESULT);
  });
});
