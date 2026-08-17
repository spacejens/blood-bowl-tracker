import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CoachesImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import type { TpCoach } from '@blood-bowl-tracker/parse-tp';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import { TpCoachesImportService } from './tp-coaches-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertCoach: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  /**
   * Optional override for `InscriptionsParserService.parseCoaches`, for
   * modelling a per-file parse failure (the identity pass-through below is
   * used for every call not covered by a `mockImplementationOnce` here).
   */
  parseCoaches?: ReturnType<typeof vi.fn>;
}

/**
 * `InscriptionsParserService.parseCoaches` is mocked as an identity
 * pass-through of each `TpSourceFile.content` (already-parsed `TpCoach[]`,
 * built directly by `inscriptionsFile()` below), rather than re-implementing
 * its Zod-based validate/flatten/trim behaviour — that behaviour is covered
 * by `InscriptionsParserService`'s own dedicated spec in
 * `packages/parse-tp/src/inscriptions-parser.service.spec.ts`. Per-file parse
 * failures are modelled with `mockImplementationOnce(() => { throw ... })`.
 */

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
  files,
  bootstrap,
  upsertCoach,
  getTpSystemName = () => 'TP',
  parseCoaches,
}: MakeServiceOptions): Promise<{
  service: TpCoachesImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const sourceReader = mock<TpSourceReader>();
  sourceReader.files.mockImplementation(files);
  const inscriptionsParser = mock<InscriptionsParserService>();
  inscriptionsParser.parseCoaches.mockImplementation(
    (content) => content as TpCoach[],
  );
  if (parseCoaches) {
    inscriptionsParser.parseCoaches.mockImplementationOnce(
      asProviderMethod(parseCoaches),
    );
  }
  const coachesImport = mock<CoachesImportService>();
  coachesImport.upsertCoach.mockImplementation(asProviderMethod(upsertCoach));
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const nameExternalId = mockNameExternalIdService();
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpCoachesImportService,
      { provide: TpSourceReader, useValue: sourceReader },
      { provide: InscriptionsParserService, useValue: inscriptionsParser },
      { provide: CoachesImportService, useValue: coachesImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpCoachesImportService),
    importResults,
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

/** Models files() throwing partway through (e.g. a missing era directory). */
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

/**
 * Builds a `TpSourceFile` whose `content` is already the `TpCoach[]` that
 * `InscriptionsParserService.parseCoaches` would have produced from a real
 * `inscriptions_<slug>_inscriptions.json` body — the mocked parser above is
 * an identity pass-through of this `content`.
 */
function inscriptionsFile(
  era: string,
  competition: string,
  coaches: TpCoach[],
): TpSourceFile {
  return {
    era,
    competition,
    type: 'inscriptions',
    filename: `inscriptions_${competition}_inscriptions.json`,
    content: coaches,
  };
}

/** The upsertCoach result record; only `id` is read by the importer. */
function coachRecord(id: number) {
  return { id, name: 'X', createdAt: new Date(), created: true };
}

/** Two systems is not enough — coaches use three (TP, Name, NAF). */
function makeThreeSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2, 3] });
}

describe('TpCoachesImportService', () => {
  it('upserts the TP, Name and NAF external systems in order', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', name: 'Alice', nafNumber: 1 },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
      { name: 'NAF', category: 'referenced_not_imported' },
    ]);
  });

  it('gives a coach with a nafNumber three external ids', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service, importResults } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'guid-a', name: 'Alice', nafNumber: 19767 },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([]);
    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Alice',
        externalIds: [
          { externalSystemId: 1, externalId: 'guid-a' },
          { externalSystemId: 2, externalId: 'Alice' },
          { externalSystemId: 3, externalId: '19767' },
        ],
      },
      expect.any(Array),
    );
  });

  it('gives a coach without a nafNumber only two external ids', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'guid-b', name: 'Bob' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Bob',
        externalIds: [
          { externalSystemId: 1, externalId: 'guid-b' },
          { externalSystemId: 2, externalId: 'Bob' },
        ],
      },
      expect.any(Array),
    );
  });

  it('dedupes a coach appearing across multiple competitions and eras', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service, importResults } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'dup', name: 'Alice', nafNumber: 1 },
        ]),
        inscriptionsFile('Fifth era', 'blood-bowl-9', [
          { id: 'dup', name: 'Alice', nafNumber: 1 },
          { id: 'other', name: 'Bob' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(2);
    expect(resultArgs(importResults).imported).toBe(2);
  });

  it('records a parse error for one bad inscriptions file but imports the rest', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service, importResults } = await makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'inscriptions',
          filename: 'inscriptions_chaos-cup-8_inscriptions.json',
          content: undefined, // triggers the parseCoaches throw below
        },
        inscriptionsFile('Fourth era', 'blood-bowl-9', [
          { id: 'good', name: 'Alice' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
      parseCoaches: vi.fn().mockImplementation(() => {
        throw new Error('player.id: Required');
      }),
    });

    await service.importCoaches();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      errors.some((e) =>
        e.message.includes('inscriptions_chaos-cup-8_inscriptions.json'),
      ),
    ).toBe(true);
  });

  it('ignores non-inscriptions files', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service, importResults } = await makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'tournament',
          filename: 'tournament_chaos-cup-8.json',
          content: { id: 1, name: 'X', ruleSet: 20 },
        },
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'awards',
          filename: 'awards_chaos-cup-8_awards.json',
          content: { '1': [] },
        },
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'good', name: 'Alice' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(1);
    expect(resultArgs(importResults).imported).toBe(1);
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP', 'Name', 'NAF'] },
        message: 'network timeout',
      },
    });
    const upsertCoach = vi.fn();
    const { service, importResults } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', name: 'Alice' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({
      externalSystems: ['TP', 'Name', 'NAF'],
    });
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('records a diagnostic error but keeps coaches found before a scan failure', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service, importResults } = await makeService({
      files: makeFilesThatThrow(
        [
          inscriptionsFile('Fourth era', 'chaos-cup-8', [
            { id: 'a', name: 'Alice' },
          ]),
        ],
        new Error(
          'Era data directory not found: /data/fifth-era (configured for era "Fifth era").',
        ),
      ),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      errors.some((e) => e.message.includes('Era data directory not found')),
    ).toBe(true);
  });

  it('records an error and continues when a coach upsert fails', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi
      .fn()
      .mockImplementationOnce(
        (_data: unknown, errors: { message: string }[]) => {
          errors.push({ message: 'Failed to import coach "Alice"' });
          return Promise.resolve(undefined);
        },
      )
      .mockResolvedValue(coachRecord(11));
    const { service, importResults } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', name: 'Alice' },
          { id: 'b', name: 'Bob' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    await service.importCoaches();

    expect(resultArgs(importResults).imported).toBe(1);
  });

  it('re-runs idempotently, upserting the same coach with identical data', async () => {
    const makeRun = async () => {
      const bootstrap = makeThreeSystemUpsertMock();
      const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
      const { service, importResults } = await makeService({
        files: makeFiles([
          inscriptionsFile('Fourth era', 'chaos-cup-8', [
            { id: 'a', name: 'Alice', nafNumber: 1 },
          ]),
        ]),
        bootstrap,
        upsertCoach,
      });
      return { service, importResults, upsertCoach };
    };

    const first = await makeRun();
    await first.service.importCoaches();
    const second = await makeRun();
    await second.service.importCoaches();

    expect(resultArgs(first.importResults).imported).toBe(1);
    expect(resultArgs(second.importResults).imported).toBe(1);
    expect(first.upsertCoach.mock.calls[0][0]).toEqual(
      second.upsertCoach.mock.calls[0][0],
    );
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const { service } = await makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', name: 'Alice' },
        ]),
      ]),
      bootstrap,
      upsertCoach,
    });

    const { result } = await service.importCoaches();

    expect(result).toBe(CANNED_RESULT);
  });
});
