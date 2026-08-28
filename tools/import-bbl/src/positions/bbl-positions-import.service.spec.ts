import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPlayer } from '../players/player-page-parser';
import { PlayerPageParser } from '../players/player-page-parser';
import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblPositionsImportService } from './bbl-positions-import.service';
import type { BblPosition } from './position-page-parser';
import { PositionPageParser } from './position-page-parser';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
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

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is
 * covered by ../source/page-parse-error.service.spec.ts. This spec asserts
 * only what BblPositionsImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

/**
 * The full upsert result record (PositionsImportService.upsert
 * resolves the API's Position + created shape). Defaults match the id=100
 * value repeated across these tests; pass overrides to vary the id.
 */
function makePositionRecord(overrides: { id?: number } = {}) {
  return {
    id: overrides.id ?? 100,
    name: 'Position',
    isStarPlayer: false,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

function ptPage(position: BblPosition | null): BblPage {
  return {
    type: 'pt',
    params: { position: JSON.stringify(position) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function plPage(player: BblPlayer | null): BblPage {
  return {
    type: 'pl',
    params: { player: JSON.stringify(player) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

interface Mocks {
  positionParser: MockProxy<PositionPageParser>;
  playerParser: MockProxy<PlayerPageParser>;
  positionsImport: MockProxy<PositionsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblPositionsImportService; mocks: Mocks }> {
  const positionParser = mock<PositionPageParser>();
  positionParser.extractPosition.mockImplementation(
    (p) => JSON.parse(p.params.position) as BblPosition | null,
  );

  const playerParser = mock<PlayerPageParser>();
  playerParser.extractPlayer.mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );

  const positionsImport = mock<PositionsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  // `forStarPosition` is a pure identity passthrough with no branching or
  // formatting, so there is no algorithm here that can drift out of sync with
  // the real NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forStarPosition.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPositionsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: PositionPageParser, useValue: positionParser },
      { provide: PlayerPageParser, useValue: playerParser },
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblPositionsImportService),
    mocks: {
      positionParser,
      playerParser,
      positionsImport,
      bootstrap,
      nameExternalId,
      importResults,
      pageParseError,
    },
  };
}

const racesByBblId = new Map<string, { id: number; name: string }>([
  ['48', { id: 480, name: 'College of Shadow' }],
  ['7', { id: 70, name: 'Goblin Team' }],
  ['14', { id: 140, name: 'Norse Team' }],
]);

const teamRaceIdsByCode = new Map<string, number>([
  ['knu', 140],
  ['col', 480],
]);

describe('BblPositionsImportService', () => {
  it('upserts one row per listed race with composite external ids', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '7', name: 'Goblin Team' },
            ],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-shadow')
      .mockReturnValueOnce('name-id-goblin');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith(
      [
        { name: 'BBL', category: 'imported_data_source' },
        { name: 'Name', category: 'bookkeeping' },
      ],
      'Failed to upsert external system: ',
    );
    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'College of Shadow',
      'Goblin Linemen',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'Goblin Team',
      'Goblin Linemen',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '33-48' },
          {
            externalSystemId: 2,
            externalId: 'name-id-shadow',
          },
        ],
      },
      expect.any(Array),
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '33-7' },
          { externalSystemId: 2, externalId: 'name-id-goblin' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([480, 70]),
    });
  });

  it('imports listed races and an extra reverse-engineered race (non-star) as a duplicate candidate row', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '60',
            name: 'Minotaur 2',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        pl: [
          plPage({
            pid: '111',
            name: 'Minotaur 2',
            typId: '60',
            teamCode: 'knu', // -> race 140 (Norse Team, bblId '14'), NOT listed
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-goblin')
      .mockReturnValueOnce('name-id-norse');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Goblin Team',
      'Minotaur 2',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'Norse Team',
      'Minotaur 2',
    );
    // listed race
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-7' },
          { externalSystemId: 2, externalId: 'name-id-goblin' },
        ],
      },
      expect.any(Array),
    );
    // extra reverse-engineered race: duplicate row
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock,
    // so the extra race just adds another candidate for the same position
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([70, 140]),
    });
  });

  it('imports listed races and an extra reverse-engineered race (star) merged into one row', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '60',
            name: 'Minotaur 2',
            isStarPlayer: true,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        pl: [
          plPage({
            pid: '111',
            name: 'Minotaur 2',
            typId: '60',
            teamCode: 'knu', // -> race 140 (Norse Team, bblId '14'), NOT listed
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-goblin')
      .mockReturnValueOnce('name-id-norse');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Goblin Team',
      'Minotaur 2',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'Norse Team',
      'Minotaur 2',
    );
    // listed race row (unchanged listed-race convention: isStarPlayer false)
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-7' },
          { externalSystemId: 2, externalId: 'name-id-goblin' },
        ],
      },
      expect.any(Array),
    );
    // extra races merged into one star row with a bare-name external id
    // (the 'Minotaur 2' entry comes from the exempt forStarPosition mock)
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 2, externalId: 'Minotaur 2' },
          { externalSystemId: 1, externalId: '60-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock;
    // the star candidate merges with the listed-race candidate
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: true,
      raceDbIds: new Set([70, 140]),
    });
  });

  it('imports only listed races when the reverse-engineered race is already listed (dedup, no regression)', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '7', name: 'Goblin Team' },
            ],
          }),
        ],
        pl: [
          plPage({
            pid: '222',
            name: 'Goblin Linemen',
            typId: '33',
            teamCode: 'col', // -> race 480 (College of Shadow, bblId '48') = already listed
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    // Only the 2 listed races import; the resolved race is deduped away.
    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(2);
  });

  it('skips a listed race not in the map but imports the others', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '999', name: 'Unknown Race' },
            ],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(1);
    expect(errors.some((e) => e.message.includes('Unknown Race'))).toBe(true);
  });

  it('imports a star player as one row with a positions_race_eras row per resolved race and a bare-name external id', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Wilhelm Chaney',
            isStarPlayer: true,
            races: [],
          }),
        ],
        pl: [
          plPage({
            pid: '123',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'knu',
            sppTotal: null,
          }),
          plPage({
            pid: '123',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'col',
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-norse')
      .mockReturnValueOnce('name-id-shadow');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Norse Team',
      'Wilhelm Chaney',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'College of Shadow',
      'Wilhelm Chaney',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Wilhelm Chaney',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 2, externalId: 'Wilhelm Chaney' },
          { externalSystemId: 1, externalId: '99-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
          { externalSystemId: 1, externalId: '99-48' },
          {
            externalSystemId: 2,
            externalId: 'name-id-shadow',
          },
        ],
      },
      expect.any(Array),
    );
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: true,
      raceDbIds: new Set([140, 480]),
    });
  });

  it('imports a defunct-race position as duplicate rows, recorded as a candidate', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
          }),
        ],
        pl: [
          plPage({
            pid: '456',
            name: 'Norse Catchers',
            typId: '121',
            teamCode: 'knu',
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition.mockReturnValueOnce('name-id-norse');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Norse Team',
      'Norse Catchers',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Norse Catchers',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '121-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
        ],
      },
      expect.any(Array),
    );
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([140]),
    });
  });

  it('skips a zero-race star player when no player is found and records an error', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Zolcath the Zoat',
            isStarPlayer: true,
            races: [],
          }),
        ],
        pl: [],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('Zolcath the Zoat'))).toBe(
      true,
    );
  });

  it('skips a zero-race non-star position when no player is found and records an error', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
          }),
        ],
        pl: [],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('Norse Catchers'))).toBe(true);
  });

  it('skips a resolved player whose team race is not in the maps', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Grotty',
            isStarPlayer: true,
            races: [],
          }),
        ],
        pl: [
          plPage({
            pid: '789',
            name: 'Grotty',
            typId: '99',
            teamCode: 'unknown-code',
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('Grotty'))).toBe(true);
  });

  it('skips pages the position parser returns null for', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pt: [ptPage(null)] }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
  });

  it('records an error and continues when a position page throws while parsing', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage(null),
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '48', name: 'College of Shadow' }],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    const parseError = new Error('bad page');
    mocks.positionParser.extractPosition.mockImplementationOnce(() => {
      throw parseError;
    });

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { position: 'null' },
      'position',
      parseError,
    );
  });

  it('records one error and skips positions when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '48', name: 'College of Shadow' }],
          }),
        ],
      }),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'Failed to upsert external system: internal error',
      },
    });

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(resultArgs(mocks.importResults).errors).not.toEqual([]);
    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('external system'),
      ),
    ).toBe(true);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
  });

  it('records an error when a scanned team code has no race in teamRaceIdsByCode', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        pl: [
          plPage({
            pid: '333',
            name: 'Lineman',
            typId: '10',
            teamCode: 'ghost', // not in teamRaceIdsByCode
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    // The listed race still imports; the unresolved team code is recorded.
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('ghost'))).toBe(true);
    expect(
      errors.some((e) =>
        e.message.includes('team code not in teamRaceIdsByCode'),
      ),
    ).toBe(true);
  });

  it('records an error when a resolved race db id is missing from racesByBblId', async () => {
    const teamRaceIdsWithOrphan = new Map<string, number>([
      ['knu', 140],
      ['col', 480],
      ['orphan', 999], // 999 has no entry in racesByBblId
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        pl: [
          plPage({
            pid: '444',
            name: 'Lineman',
            typId: '10',
            teamCode: 'orphan', // -> db id 999, absent from racesByBblId
            sppTotal: null,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsWithOrphan);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('999'))).toBe(true);
    expect(
      errors.some((e) =>
        e.message.includes('race info missing from racesByBblId'),
      ),
    ).toBe(true);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result).toBe(CANNED_RESULT);
  });
});
