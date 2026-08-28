import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionGroupsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblCompetitionEntry } from '../competitions/bbl-competitions-import.service';
import { BblCompetitionTrophyReaderService } from '../matches/bbl-competition-trophy-reader.service';
import type { CompetitionTrophyRows } from '../matches/competition-trophy-page-parser';
import { mockReferenceLookup } from '../shared/reference-lookup-mock.test-helpers';
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
  competitionGroupsImport: MockProxy<CompetitionGroupsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
const BBL_SYSTEM_ID = 7;

/** A BblCompetitionEntry fixture keyed under the BBL system by `bblId`. */
function makeCompetition(
  bblId: string,
  overrides: Partial<BblCompetitionEntry> = {},
): BblCompetitionEntry {
  return {
    upsert: {
      name: `Competition ${bblId}`,
      type: 'season',
      eraId: 200,
      teamEraIds: [],
      externalIds: [{ externalSystemId: BBL_SYSTEM_ID, externalId: bblId }],
    },
    competitionGroupId: 9,
    ...overrides,
  };
}

async function makeService(
  rowsByCompetitionId: Map<string, CompetitionTrophyRows>,
  competitionIdsByBblId: Map<string, number> = new Map([['1', 11]]),
): Promise<{ service: BblTrophyAwardsImportService; mocks: Mocks }> {
  const mocks: Mocks = {
    trophyReader: mock<BblCompetitionTrophyReaderService>(),
    trophiesImport: mock<TrophiesImportService>(),
    trophyAwardsImport: mock<TrophyAwardsImportService>(),
    competitionGroupsImport: mock<CompetitionGroupsImportService>(),
    bootstrap: mock<ExternalSystemBootstrapService>(),
    nameConfig: mock<ExternalSystemNameConfigService>(),
    importResults: mock<ImportResultService>(),
    lookup: mock<ReferenceLookupService>(),
  };
  mocks.trophyReader.getRowsByCompetitionId.mockResolvedValue(
    rowsByCompetitionId,
  );
  mocks.nameConfig.getBblSystemName.mockReturnValue('tloeg.bbleague.se');
  mocks.bootstrap.bootstrap.mockResolvedValue({
    ok: true,
    ids: [BBL_SYSTEM_ID],
  });
  mocks.importResults.error.mockImplementation((args) => args);
  mocks.importResults.result.mockReturnValue(CANNED_RESULT);
  // Default: every label resolves to trophy 100, every award write succeeds.
  mocks.trophiesImport.upsert.mockResolvedValue({
    id: 100,
  } as never);
  mocks.trophyAwardsImport.upsert.mockResolvedValue({
    id: 500,
  } as never);
  mockReferenceLookup(mocks.lookup, { competition: competitionIdsByBblId });
  // Default: two curated groups. Every fixture competition below is in group
  // 9 ("Major Season") unless a test overrides it.
  mocks.competitionGroupsImport.listCompetitionGroups.mockResolvedValue([
    { id: 9, name: 'Major Season' },
    { id: 10, name: 'Minor Season' },
  ] as never);

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
      {
        provide: CompetitionGroupsImportService,
        useValue: mocks.competitionGroupsImport,
      },
      { provide: ExternalSystemBootstrapService, useValue: mocks.bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: mocks.nameConfig },
      { provide: ImportResultService, useValue: mocks.importResults },
      { provide: ReferenceLookupService, useValue: mocks.lookup },
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
    competitionEntriesByBblId: new Map([['1', makeCompetition('1')]]),
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

    expect(mocks.trophiesImport.upsert).toHaveBeenCalledWith(
      {
        externalIds: [
          {
            externalSystemId: 7,
            externalId: 'Major 1st-Major Season',
          },
        ],
      },
      [],
    );
    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
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

    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
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

    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledTimes(2);
    expect(
      mocks.trophyAwardsImport.upsert.mock.calls.map(([data]) => data.playerId),
    ).toEqual([31, 32]);
    // The label is resolved once and reused for both rows.
    expect(mocks.trophiesImport.upsert).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(2);
  });

  it('skips a competition that was not imported', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );

    await service.importTrophyAwards(
      options({ competitionEntriesByBblId: new Map() }),
    );

    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toHaveLength(1);
  });

  it('skips a competition whose group is not in the curated catalog', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );

    await service.importTrophyAwards(
      options({
        competitionEntriesByBblId: new Map([
          ['1', makeCompetition('1', { competitionGroupId: 404 })],
        ]),
      }),
    );

    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toEqual([
      {
        item: { competition: '1' },
        message:
          'Skipping trophy awards for competition id 1: its competition ' +
          'group 404 is not in the curated competition-group catalog.',
      },
    ]);
  });

  it('aborts when the competition-groups list cannot be fetched', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );
    mocks.competitionGroupsImport.listCompetitionGroups.mockResolvedValue(
      undefined,
    );

    const outcome = await service.importTrophyAwards(options());

    expect(outcome.result).toBe(CANNED_RESULT);
    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
    expect(mocks.trophyReader.getRowsByCompetitionId).not.toHaveBeenCalled();
  });

  it('records a skip error for an unresolvable team code', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'nope' }]),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
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

    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
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

    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
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
    mocks.trophiesImport.upsert.mockResolvedValue(undefined);

    await service.importTrophyAwards(options());

    // Resolved once per row-group (memoized), which is one composite attempt
    // plus one bare-label fallback since neither matches a curated trophy.
    expect(mocks.trophiesImport.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('does not count an award whose write failed', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );
    mocks.trophyAwardsImport.upsert.mockResolvedValue(undefined);

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
    const { service, mocks } = await makeService(
      rowsByCompetitionId,
      new Map([
        ['1', 11],
        ['2', 12],
      ]),
    );
    // Every label resolves to trophy 100 except the made-up one (composite or
    // bare), which TrophiesImportService answers undefined for (as it would
    // for any external id matching no curated trophy).
    mocks.trophiesImport.upsert.mockImplementation((data) =>
      Promise.resolve(
        data.externalIds[0].externalId.startsWith('Made Up Prize')
          ? undefined
          : ({ id: 100 } as never),
      ),
    );

    await service.importTrophyAwards(
      options({
        competitionEntriesByBblId: new Map([
          ['1', makeCompetition('1')],
          ['2', makeCompetition('2')],
        ]),
        teamEraIdsByCompetitionBblId: new Map([
          ['1', new Map([['sew', 21]])],
          ['2', new Map([['sew', 22]])],
        ]),
      }),
    );

    // The unrecognized label is resolved once for the whole run, not once
    // per competition that references it: one composite attempt plus one
    // bare-label fallback, both memoized under the same group-scoped key.
    expect(
      mocks.trophiesImport.upsert.mock.calls.filter(([data]) =>
        data.externalIds[0].externalId.startsWith('Made Up Prize'),
      ),
    ).toHaveLength(2);
    // Competition 2's other, resolvable row still got written, proving the
    // loop moved on after competition 1's (and competition 2's own) skip.
    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
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
    const { service, mocks } = await makeService(
      rowsByCompetitionId,
      new Map([
        ['1', 11],
        ['2', 12],
      ]),
    );
    mocks.trophiesImport.upsert.mockResolvedValue(undefined);

    await service.importTrophyAwards(
      options({
        competitionEntriesByBblId: new Map([
          ['1', makeCompetition('1')],
          ['2', makeCompetition('2')],
        ]),
        teamEraIdsByCompetitionBblId: new Map([
          ['1', new Map([['sew', 21]])],
          ['2', new Map([['sew', 22]])],
        ]),
      }),
    );

    // The key is resolved (one composite attempt plus one bare-label
    // fallback, whose failure TrophiesImportService records) once; the two
    // later rows that also referenced it are dropped silently unless a
    // summary error is added for them.
    expect(mocks.trophiesImport.upsert).toHaveBeenCalledTimes(2);
    const { errors } = resultArgs(mocks.importResults);
    const summaryErrors = errors.filter((error) =>
      error.message.includes('2 further'),
    );
    expect(summaryErrors).toHaveLength(1);
    expect(summaryErrors[0].message).toContain(
      '"Made Up Prize" label in competition group "Major Season"',
    );
  });

  it('resolves a trophy by its group-scoped composite external id first', async () => {
    const { service, mocks } = await makeService(
      rows([], [{ label: 'Deadliest Player', pid: '102' }]),
    );
    mocks.trophiesImport.upsert.mockImplementation((data) =>
      Promise.resolve(
        data.externalIds?.[0].externalId === 'Deadliest Player-Major Season'
          ? ({ id: 201 } as never)
          : undefined,
      ),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsert).toHaveBeenCalledWith(
      {
        externalIds: [
          {
            externalSystemId: BBL_SYSTEM_ID,
            externalId: 'Deadliest Player-Major Season',
          },
        ],
      },
      expect.any(Array),
    );
    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
      { trophyId: 201, competitionId: 11, teamEraId: 41, playerId: 31 },
      expect.any(Array),
    );
  });

  it('falls back to the bare label when no group-scoped trophy exists', async () => {
    const { service, mocks } = await makeService(
      rows([{ label: 'Major 1st', teamCode: 'sew' }]),
    );
    mocks.trophiesImport.upsert.mockImplementation((data) =>
      Promise.resolve(
        data.externalIds?.[0].externalId === 'Major 1st'
          ? ({ id: 300 } as never)
          : undefined,
      ),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
      { trophyId: 300, competitionId: 11, teamEraId: 21, playerId: null },
      expect.any(Array),
    );
    // The failed composite attempt must not pollute the run's import errors:
    // a self-disambiguating team label legitimately has no composite row.
    expect(resultArgs(mocks.importResults).errors).toEqual([]);
  });

  it('does not conflate the same label awarded in two different groups', async () => {
    const { service, mocks } = await makeService(
      new Map([
        [
          '1',
          {
            teamTrophies: [],
            playerPrizes: [{ label: 'Deadliest Player', pid: '102' }],
          },
        ],
        [
          '2',
          {
            teamTrophies: [],
            playerPrizes: [{ label: 'Deadliest Player', pid: '103' }],
          },
        ],
      ]),
      new Map([
        ['1', 11],
        ['2', 12],
      ]),
    );
    mocks.trophiesImport.upsert.mockImplementation((data) => {
      const externalId = data.externalIds?.[0].externalId;
      if (externalId === 'Deadliest Player-Major Season') {
        return Promise.resolve({ id: 201 } as never);
      }
      if (externalId === 'Deadliest Player-Minor Season') {
        return Promise.resolve({ id: 202 } as never);
      }
      return Promise.resolve(undefined);
    });

    await service.importTrophyAwards(
      options({
        competitionEntriesByBblId: new Map([
          ['1', makeCompetition('1')],
          ['2', makeCompetition('2', { competitionGroupId: 10 })],
        ]),
        teamEraIdsByCompetitionBblId: new Map([
          ['1', new Map([['sew', 21]])],
          ['2', new Map([['sew', 22]])],
        ]),
      }),
    );

    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
      { trophyId: 201, competitionId: 11, teamEraId: 41, playerId: 31 },
      expect.any(Array),
    );
    expect(mocks.trophyAwardsImport.upsert).toHaveBeenCalledWith(
      { trophyId: 202, competitionId: 12, teamEraId: 42, playerId: 32 },
      expect.any(Array),
    );
  });

  it('reports an unresolvable label under its group-scoped key', async () => {
    const { service, mocks } = await makeService(
      rows(
        [],
        [
          { label: 'Unknown Prize', pid: '102' },
          { label: 'Unknown Prize', pid: '103' },
        ],
      ),
    );
    mocks.trophiesImport.upsert.mockResolvedValue(undefined);

    await service.importTrophyAwards(options());

    expect(mocks.trophyAwardsImport.upsert).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toContainEqual({
      item: { trophy: 'Unknown Prize' },
      message:
        'Skipped 1 further award row(s) referencing the "Unknown Prize" ' +
        'label in competition group "Major Season": it could not be ' +
        'resolved (see the earlier error for this label/group).',
    });
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
