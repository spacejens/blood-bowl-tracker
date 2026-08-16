import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblCompetitionTrophyReaderService } from '../matches/bbl-competition-trophy-reader.service';
import type { CompetitionTrophyRows } from '../matches/competition-trophy-page-parser';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import {
  BblTrophyAwardsImportService,
  type ImportBblTrophyAwardsOptions,
} from './bbl-trophy-awards-import.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own derivation is covered by
 * packages/import/src/import-result.service.spec.ts; this spec asserts what
 * the service under test passes to result() and that it returns result()'s
 * value unchanged.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

interface Mocks {
  trophyReader: MockProxy<BblCompetitionTrophyReaderService>;
  trophiesImport: MockProxy<TrophiesImportService>;
  trophyAwardsImport: MockProxy<TrophyAwardsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
}

async function makeService(
  rowsByCompetitionId: Map<string, CompetitionTrophyRows>,
): Promise<{ service: BblTrophyAwardsImportService; mocks: Mocks }> {
  const mocks: Mocks = {
    trophyReader: mock<BblCompetitionTrophyReaderService>(),
    trophiesImport: mock<TrophiesImportService>(),
    trophyAwardsImport: mock<TrophyAwardsImportService>(),
    bootstrap: mock<ExternalSystemBootstrapService>(),
    nameConfig: mock<ExternalSystemNameConfigService>(),
    importResults: mock<ImportResultService>(),
  };
  mocks.trophyReader.getRowsByCompetitionId.mockResolvedValue(
    rowsByCompetitionId,
  );
  mocks.nameConfig.getBblSystemName.mockReturnValue('tloeg.bbleague.se');
  mocks.bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [7] });
  mocks.importResults.error.mockImplementation((args) => args);
  mocks.importResults.result.mockReturnValue(CANNED_RESULT);
  // Default: every label resolves to trophy 100, every award write succeeds.
  mocks.trophiesImport.upsertTrophy.mockResolvedValue({
    id: 100,
  } as never);
  mocks.trophyAwardsImport.upsertTrophyAward.mockResolvedValue({
    id: 500,
  } as never);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblTrophyAwardsImportService,
      {
        provide: BblCompetitionTrophyReaderService,
        useValue: mocks.trophyReader,
      },
      { provide: TrophiesImportService, useValue: mocks.trophiesImport },
      {
        provide: TrophyAwardsImportService,
        useValue: mocks.trophyAwardsImport,
      },
      { provide: ExternalSystemBootstrapService, useValue: mocks.bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: mocks.nameConfig },
      { provide: ImportResultService, useValue: mocks.importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblTrophyAwardsImportService),
    mocks,
  };
}

function options(
  overrides: Partial<ImportBblTrophyAwardsOptions> = {},
): ImportBblTrophyAwardsOptions {
  return {
    competitionIdsByBblId: new Map([['1', 11]]),
    teamEraIdsByCompetitionBblId: new Map([['1', new Map([['sew', 21]])]]),
    playerIdsByPid: new Map([
      ['102', 31],
      ['103', 32],
    ]),
    teamEraIdsByPid: new Map([
      ['102', 41],
      ['103', 42],
    ]),
    ...overrides,
  };
}

const rows = (
  teamTrophies: CompetitionTrophyRows['teamTrophies'],
  playerPrizes: CompetitionTrophyRows['playerPrizes'] = [],
): Map<string, CompetitionTrophyRows> =>
  new Map([['1', { teamTrophies, playerPrizes }]]);

describe('BblTrophyAwardsImportService', () => {
  it('records a team award with no player', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );

    const outcome = await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
      {
        externalIds: [{ externalSystemId: 7, externalId: 'Major 1st' }],
      },
      expect.anything(),
    );
    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      { trophyId: 100, competitionId: 11, teamEraId: 21, playerId: null },
      expect.anything(),
    );
    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(outcome.result).toBe(CANNED_RESULT);
  });

  it("records a player award under the player's own team era", async () => {
    const { service, mocks } = await makeService(
      rows([], [{ label: 'Top Scorer', pid: '102' }]),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      { trophyId: 100, competitionId: 11, teamEraId: 41, playerId: 31 },
      expect.anything(),
    );
  });

  it('records one row per tied player', async () => {
    const { service, mocks } = await makeService(
      rows(
        [],
        [
          { label: 'Top Intercepter', pid: '102' },
          { label: 'Top Intercepter', pid: '103' },
        ],
      ),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledTimes(2);
    expect(
      mocks.trophyAwardsImport.upsertTrophyAward.mock.calls.map(
        ([data]) => data.playerId,
      ),
    ).toEqual([31, 32]);
    // The label is resolved once and reused for both rows.
    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(2);
  });

  it('skips a competition that was not imported', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );

    await service.importTrophyAwards(
      options({ competitionIdsByBblId: new Map() }),
    );

    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toHaveLength(1);
  });

  it('records a skip error for an unresolvable team code', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'nope' }]),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('nope');
  });

  it('records a skip error for every team-trophy row when a competition is entirely absent from teamEraIdsByCompetitionBblId', async () => {
    const { service, mocks } = await makeService(
      rows([
        { label: 'Major 1st', teamCode: 'sew' },
        { label: 'Major 2nd', teamCode: 'nsl' },
      ]),
    );

    await service.importTrophyAwards(
      options({ teamEraIdsByCompetitionBblId: new Map() }),
    );

    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('sew');
    expect(errors[1].message).toContain('nsl');
  });

  it('records a skip error for an unresolvable pid', async () => {
    const { service, mocks } = await makeService(
      rows([], [{ label: 'Top Scorer', pid: '999' }]),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toHaveLength(1);
  });

  it('skips every row of an unrecognized trophy label, resolving it once', async () => {
    const { service, mocks } = await makeService(
      rows(
        [],
        [
          { label: 'Made Up Prize', pid: '102' },
          { label: 'Made Up Prize', pid: '103' },
        ],
      ),
    );
    // TrophiesImportService records its own error and answers undefined when
    // the label matches no curated trophy.
    mocks.trophiesImport.upsertTrophy.mockResolvedValue(undefined);

    await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledTimes(1);
    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('does not count an award whose write failed', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );
    mocks.trophyAwardsImport.upsertTrophyAward.mockResolvedValue(undefined);

    await service.importTrophyAwards(options());

    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('memoizes an unresolved label per run and keeps processing later competitions', async () => {
    const rowsByCompetitionId = new Map<string, CompetitionTrophyRows>([
      [
        '1',
        {
          teamTrophies: [],
          playerPrizes: [{ label: 'Made Up Prize', pid: '102' }],
        },
      ],
      [
        '2',
        {
          teamTrophies: [{ label: 'Made Up Prize', teamCode: 'sew' }],
          playerPrizes: [{ label: 'Top Scorer', pid: '103' }],
        },
      ],
    ]);
    const { service, mocks } = await makeService(rowsByCompetitionId);
    // Every label resolves to trophy 100 except the made-up one, which
    // TrophiesImportService answers undefined for (as it would for any label
    // matching no curated trophy).
    mocks.trophiesImport.upsertTrophy.mockImplementation((data) =>
      Promise.resolve(
        data.externalIds[0].externalId === 'Made Up Prize'
          ? undefined
          : ({ id: 100 } as never),
      ),
    );

    await service.importTrophyAwards(
      options({
        competitionIdsByBblId: new Map([
          ['1', 11],
          ['2', 12],
        ]),
        teamEraIdsByCompetitionBblId: new Map([
          ['1', new Map([['sew', 21]])],
          ['2', new Map([['sew', 22]])],
        ]),
      }),
    );

    // The unrecognized label is resolved once for the whole run, not once
    // per competition that references it.
    expect(
      mocks.trophiesImport.upsertTrophy.mock.calls.filter(
        ([data]) => data.externalIds[0].externalId === 'Made Up Prize',
      ),
    ).toHaveLength(1);
    // Competition 2's other, resolvable row still got written, proving the
    // loop moved on after competition 1's (and competition 2's own) skip.
    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      { trophyId: 100, competitionId: 12, teamEraId: 42, playerId: 32 },
      expect.anything(),
    );
  });

  it('reports a summary error for further rows dropped by an already-failed label', async () => {
    const rowsByCompetitionId = new Map<string, CompetitionTrophyRows>([
      [
        '1',
        {
          teamTrophies: [],
          playerPrizes: [
            { label: 'Made Up Prize', pid: '102' },
            { label: 'Made Up Prize', pid: '103' },
          ],
        },
      ],
      [
        '2',
        {
          teamTrophies: [{ label: 'Made Up Prize', teamCode: 'sew' }],
          playerPrizes: [],
        },
      ],
    ]);
    const { service, mocks } = await makeService(rowsByCompetitionId);
    mocks.trophiesImport.upsertTrophy.mockResolvedValue(undefined);

    await service.importTrophyAwards(
      options({
        competitionIdsByBblId: new Map([
          ['1', 11],
          ['2', 12],
        ]),
        teamEraIdsByCompetitionBblId: new Map([
          ['1', new Map([['sew', 21]])],
          ['2', new Map([['sew', 22]])],
        ]),
      }),
    );

    // The label is resolved (and its failure recorded by
    // TrophiesImportService) once; the two later rows that also referenced it
    // are dropped silently unless a summary error is added for them.
    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledTimes(1);
    const { errors } = resultArgs(mocks.importResults);
    const summaryErrors = errors.filter((error) =>
      error.message.includes('2 further'),
    );
    expect(summaryErrors).toHaveLength(1);
    expect(summaryErrors[0].message).toContain('Made Up Prize');
  });

  it('bails with the bootstrap error when the external system cannot be upserted', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );
    const bootstrapError: ImportError = {
      item: { externalSystems: ['tloeg.bbleague.se'] },
      message: 'boom',
    };
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: bootstrapError,
    });

    await service.importTrophyAwards(options());

    expect(mocks.trophyReader.getRowsByCompetitionId).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toEqual([bootstrapError]);
  });
});
