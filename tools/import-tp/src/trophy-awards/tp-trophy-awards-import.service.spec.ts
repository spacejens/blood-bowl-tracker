import type {
  CompetitionGroup,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionGroupsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpAwardsReaderService } from './tp-awards-reader.service';
import {
  type ImportTpTrophyAwardsOptions,
  TpTrophyAwardsImportService,
} from './tp-trophy-awards-import.service';

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
  awardsReader: MockProxy<TpAwardsReaderService>;
  trophiesImport: MockProxy<TrophiesImportService>;
  trophyAwardsImport: MockProxy<TrophyAwardsImportService>;
  competitionGroupsImport: MockProxy<CompetitionGroupsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
}

/** The single competition group the default fixtures resolve against. */
const DEFAULT_GROUPS: CompetitionGroup[] = [
  { id: 1, name: 'Major Season', leagueId: 1, createdAt: new Date() },
];

async function makeService(
  awardsByDirectory: Map<string, TpAward[]>,
  overrides: { groups?: CompetitionGroup[] | undefined } = {},
): Promise<{ service: TpTrophyAwardsImportService; mocks: Mocks }> {
  const mocks: Mocks = {
    awardsReader: mock<TpAwardsReaderService>(),
    trophiesImport: mock<TrophiesImportService>(),
    trophyAwardsImport: mock<TrophyAwardsImportService>(),
    competitionGroupsImport: mock<CompetitionGroupsImportService>(),
    bootstrap: mock<ExternalSystemBootstrapService>(),
    nameConfig: mock<ExternalSystemNameConfigService>(),
    importResults: mockImportResultService(),
  };
  mocks.awardsReader.getAwardsByDirectory.mockResolvedValue(awardsByDirectory);
  mocks.nameConfig.getTpSystemName.mockReturnValue('tourplay.net');
  mocks.bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [9] });
  mocks.competitionGroupsImport.listCompetitionGroups.mockResolvedValue(
    'groups' in overrides ? overrides.groups : DEFAULT_GROUPS,
  );
  mocks.importResults.result.mockReturnValue(CANNED_RESULT);
  // Default: every key resolves to trophy 100, every award write succeeds.
  mocks.trophiesImport.upsertTrophy.mockResolvedValue({ id: 100 } as never);
  mocks.trophyAwardsImport.upsertTrophyAward.mockResolvedValue({
    id: 500,
  } as never);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpTrophyAwardsImportService,
      { provide: TpAwardsReaderService, useValue: mocks.awardsReader },
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
    ],
  }).compile();

  return {
    service: moduleRef.get(TpTrophyAwardsImportService),
    mocks,
  };
}

/** An UpsertCompetition as TpCompetitionsImportService builds it. */
function upsertCompetition(
  overrides: Partial<UpsertCompetition> = {},
): UpsertCompetition {
  return {
    name: 'Major Season 25',
    type: 'season',
    eraId: 5,
    teamEraIds: [],
    externalIds: [],
    ...overrides,
  };
}

/** The competitionsByTpId entry for one competition (tpId 6543 by default). */
function competitionEntry(
  overrides: Partial<{
    upsert: UpsertCompetition;
    era: string;
    competition: string;
    competitionGroupId: number;
  }> = {},
) {
  return {
    upsert: upsertCompetition(),
    era: 'Third era',
    competition: 'tloegbbl-major-season-25',
    competitionGroupId: 1,
    ...overrides,
  };
}

function options(
  overrides: Partial<ImportTpTrophyAwardsOptions> = {},
): ImportTpTrophyAwardsOptions {
  return {
    competitionsByTpId: new Map([[6543, competitionEntry()]]),
    competitionIdsByTpId: new Map([[6543, 42]]),
    teamErasByRosterId: new Map([[7, [{ id: 70, eraId: 5 }]]]),
    ...overrides,
  };
}

function award(overrides: Partial<TpAward> = {}): TpAward {
  return { id: 1, awardType: 1, rosterId: 7, ...overrides };
}

const awards = (list: TpAward[]): Map<string, TpAward[]> =>
  new Map([['Third era::tloegbbl-major-season-25', list]]);

describe('TpTrophyAwardsImportService', () => {
  it('writes a team award on the happy path', async () => {
    const { service, mocks } = await makeService(awards([award()]));

    const outcome = await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
      {
        externalIds: [{ externalSystemId: 9, externalId: '1-Major Season' }],
      },
      expect.anything(),
    );
    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      { trophyId: 100, competitionId: 42, teamEraId: 70, playerId: null },
      expect.anything(),
    );
    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(outcome.result).toBe(CANNED_RESULT);
  });

  it('disambiguates a named award by its name, not its code', async () => {
    const { service, mocks } = await makeService(
      awards([award({ id: 2, awardType: 200, name: 'Wooden Spoon' })]),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
      {
        externalIds: [
          { externalSystemId: 9, externalId: 'Wooden Spoon-Major Season' },
        ],
      },
      expect.anything(),
    );
  });

  it.each([
    [1, '1-Dungeon Bowl'],
    [2, '2-Dungeon Bowl'],
    [3, '3-Dungeon Bowl'],
  ])(
    'resolves Dungeon Bowl placement award type %i to key %s',
    async (awardType, expectedKey) => {
      const { service, mocks } = await makeService(
        awards([award({ awardType })]),
        {
          groups: [
            { id: 1, name: 'Dungeon Bowl', leagueId: 1, createdAt: new Date() },
          ],
        },
      );

      await service.importTrophyAwards(options());

      expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
        { externalIds: [{ externalSystemId: 9, externalId: expectedKey }] },
        expect.anything(),
      );
    },
  );

  it.each([
    ['Chaos Cup', '1-Chaos Cup'],
    ['Ogretoberfest', '1-Ogretoberfest'],
  ])(
    'resolves an awardType 1 award under group %s to key %s',
    async (groupName, expectedKey) => {
      const { service, mocks } = await makeService(awards([award()]), {
        groups: [
          { id: 1, name: groupName, leagueId: 1, createdAt: new Date() },
        ],
      });

      await service.importTrophyAwards(options());

      expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
        { externalIds: [{ externalSystemId: 9, externalId: expectedKey }] },
        expect.anything(),
      );
    },
  );

  it('skips a competition whose tpId was not imported', async () => {
    const { service, mocks } = await makeService(awards([award()]));

    await service.importTrophyAwards(
      options({ competitionIdsByTpId: new Map() }),
    );

    expect(mocks.trophiesImport.upsertTrophy).not.toHaveBeenCalled();
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('6543');
  });

  it('skips a competition whose group is not in the curated catalog', async () => {
    const { service, mocks } = await makeService(awards([award()]), {
      groups: [],
    });

    await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).not.toHaveBeenCalled();
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('resolves an unresolvable trophy once and reports a dedup summary error', async () => {
    const { service, mocks } = await makeService(
      awards([award({ id: 1 }), award({ id: 2 })]),
    );
    mocks.trophiesImport.upsertTrophy.mockResolvedValue(undefined);

    await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledTimes(1);
    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    const summaryErrors = errors.filter((error) =>
      error.message.includes('1 further award row(s)'),
    );
    expect(summaryErrors).toHaveLength(1);
    expect(summaryErrors[0].message).toContain('1-Major Season');
  });

  it('records an error when the roster id has no team era at all', async () => {
    const { service, mocks } = await makeService(awards([award()]));

    await service.importTrophyAwards(
      options({ teamErasByRosterId: new Map() }),
    );

    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toHaveLength(1);
  });

  it('records an error when the roster id is only known in another era', async () => {
    const { service, mocks } = await makeService(awards([award()]));

    await service.importTrophyAwards(
      options({
        teamErasByRosterId: new Map([[7, [{ id: 70, eraId: 99 }]]]),
      }),
    );

    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toHaveLength(1);
  });

  it('aborts when the competition-groups list cannot be fetched', async () => {
    const { service, mocks } = await makeService(awards([award()]), {
      groups: undefined,
    });

    await service.importTrophyAwards(options());

    expect(mocks.awardsReader.getAwardsByDirectory).not.toHaveBeenCalled();
    expect(mocks.trophyAwardsImport.upsertTrophyAward).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('bails with the bootstrap error when the external system cannot be upserted', async () => {
    const { service, mocks } = await makeService(awards([award()]));
    const bootstrapError: ImportError = {
      item: { externalSystems: ['tourplay.net'] },
      message: 'boom',
    };
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: bootstrapError,
    });

    await service.importTrophyAwards(options());

    expect(
      mocks.competitionGroupsImport.listCompetitionGroups,
    ).not.toHaveBeenCalled();
    expect(mocks.awardsReader.getAwardsByDirectory).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toEqual([bootstrapError]);
  });

  it('propagates errors the reader pushed onto the shared errors array', async () => {
    const readerError: ImportError = {
      item: { scan: 'awards files' },
      message: 'reader boom',
    };
    const { service, mocks } = await makeService(awards([award()]));
    mocks.awardsReader.getAwardsByDirectory.mockImplementation((errors) => {
      errors.push(readerError);
      return Promise.resolve(awards([award()]));
    });

    await service.importTrophyAwards(options());

    expect(resultArgs(mocks.importResults).errors).toContainEqual(readerError);
  });
});
