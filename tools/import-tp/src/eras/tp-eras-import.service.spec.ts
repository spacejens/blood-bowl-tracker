import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  ReferenceLookupService,
  type ResolvableEntityKind,
} from '@blood-bowl-tracker/import';
import type { TpTournament } from '@blood-bowl-tracker/parse-tp';
import { TournamentParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import { LeagueConfigService } from '../leagues/league-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import type { EraDataConfig } from './era-data-config.service';
import { EraDataConfigService } from './era-data-config.service';
import { TpErasImportService } from './tp-eras-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
const TP_SYSTEM_ID = 1;

interface MakeServiceOptions {
  getEras: () => EraDataConfig[];
  files: () => AsyncIterable<TpSourceFile>;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertEra: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  getLeagueName?: () => string;
  lookupMap?: (kind: ResolvableEntityKind) => Promise<Map<string, number>>;
}

/**
 * The canned TpTournament the mocked TournamentParserService.parse returns.
 * The real Zod validation (including which fields are required and the
 * message it produces) is covered by
 * packages/parse-tp/src/tournament-parser.service.spec.ts; this spec only
 * needs parse() to succeed or fail on demand.
 */
const CANNED_TOURNAMENT: TpTournament = { id: 1, name: 'T', ruleSet: 20 };

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
  getEras,
  files,
  bootstrap,
  upsertEra,
  getTpSystemName = () => 'TP',
  getLeagueName = () => 'My League',
  lookupMap = (kind) =>
    Promise.resolve(
      kind === 'league'
        ? new Map([[`${TP_SYSTEM_ID}\tMy League`, 10]])
        : new Map([
            [`${TP_SYSTEM_ID}\tLRB6`, 100],
            [`${TP_SYSTEM_ID}\tBB2020`, 200],
          ]),
    ),
}: MakeServiceOptions): Promise<{
  service: TpErasImportService;
  importResults: MockProxy<ImportResultService>;
  tournamentParser: MockProxy<TournamentParserService>;
  lookup: MockProxy<ReferenceLookupService>;
}> {
  const eraDataConfig = mock<EraDataConfigService>();
  eraDataConfig.getEras.mockImplementation(getEras);
  const erasImport = mock<ErasImportService>();
  erasImport.upsertEra.mockImplementation(asProviderMethod(upsertEra));
  const sourceReader = mock<TpSourceReader>();
  sourceReader.files.mockImplementation(files);
  sourceReader.isBaseTournamentFile.mockImplementation((filename: string) =>
    /^tournament_[^_]+\.json$/.test(filename),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const tournamentParser = mock<TournamentParserService>();
  tournamentParser.parse.mockReturnValue(CANNED_TOURNAMENT);
  const nameExternalId = mockNameExternalIdService();
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);
  const leagueConfig = mock<LeagueConfigService>();
  leagueConfig.getLeagueName.mockImplementation(getLeagueName);
  const lookup = mock<ReferenceLookupService>();
  // `keyOf` is a pure, deterministic key derivation with no branching that
  // could drift from ReferenceLookupService's own real implementation --
  // exempt from the canned-response rule, same as the other passthroughs.
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
  lookup.lookupMap.mockImplementation(lookupMap);

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
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: TournamentParserService, useValue: tournamentParser },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: LeagueConfigService, useValue: leagueConfig },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpErasImportService),
    importResults,
    tournamentParser,
    lookup,
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

const oneEra: EraDataConfig = {
  name: 'Era One',
  dataSubdir: 'era-one',
  rulesSets: ['CRP'],
  startDate: '2011-09-09',
};

describe('TpErasImportService', () => {
  it('resolves the league and every rules set through the api', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Era One' });
    const { service, lookup } = await makeService({
      getEras: () => [oneEra],
      files: makeFiles([]),
      bootstrap,
      upsertEra,
      lookupMap: (kind) =>
        Promise.resolve(
          kind === 'league'
            ? new Map([[`${TP_SYSTEM_ID}\tMy League`, 10]])
            : new Map([[`${TP_SYSTEM_ID}\tCRP`, 100]]),
        ),
    });

    await service.importEras();

    expect(lookup.lookupMap).toHaveBeenCalledWith('league', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'My League' },
    ]);
    expect(lookup.lookupMap).toHaveBeenCalledWith('rulesSet', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'CRP' },
    ]);
  });

  it('records an error and imports no era when the league does not resolve', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn();
    const { service, importResults } = await makeService({
      getEras: () => [oneEra],
      files: makeFiles([]),
      bootstrap,
      upsertEra,
      lookupMap: () => Promise.resolve(new Map()),
    });

    await service.importEras();

    const { errors } = resultArgs(importResults);
    expect(errors[0].message).toContain(
      'Cannot import eras: the league could not be resolved',
    );
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('records an error and imports no era, without throwing, when the league name cannot be read from config', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn();
    const { service, importResults, lookup } = await makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
      getLeagueName: () => {
        throw new Error(
          'league.name is not set in import-tp-config.json5. Set league.name ' +
            'to the name of the league the TP data covers (e.g. "tLoEGBBL").',
        );
      },
    });

    await service.importEras();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(
      'Cannot import eras: the league name could not be read',
    );
    expect(errors[0].message).toContain('league.name is not set');
    expect(upsertEra).not.toHaveBeenCalled();
    expect(lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('upserts each era with resolved rule-set ids and dates', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Third era' })
      .mockResolvedValueOnce({ id: 600, name: 'Fourth era' });
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
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
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

  it('skips an era whose rule set was not imported, recording an error', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'Third era' });
    const { service, importResults } = await makeService({
      getEras: () => eras,
      files: makeFiles([]),
      bootstrap,
      upsertEra,
      lookupMap: (kind) =>
        Promise.resolve(
          kind === 'league'
            ? new Map([[`${TP_SYSTEM_ID}\tMy League`, 10]])
            : new Map([[`${TP_SYSTEM_ID}\tLRB6`, 100]]),
        ),
    });

    await service.importEras();

    // Third era resolves (LRB6), Fourth era does not (BB2020 missing).
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(upsertEra).toHaveBeenCalledTimes(1);
    expect(
      errors.some(
        (e) => e.message.includes('Fourth era') && e.message.includes('BB2020'),
      ),
    ).toBe(true);
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
      .mockReturnValueOnce({ id: 1, name: 'T', ruleSet: 20 })
      .mockReturnValueOnce({ id: 1, name: 'T', ruleSet: 21 });

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
        item: { externalSystems: ['TP', 'Name'] },
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
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
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
