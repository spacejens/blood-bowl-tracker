import type {
  CompetitionGroup,
  Trophy,
  TrophyAward,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionGroupsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
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

/** The TP external system id every fixture competition's externalIds[0] uses. */
const TP_SYSTEM_ID = 9;

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
  overrides: {
    groups?: CompetitionGroup[] | undefined;
    /** TP competition id -> DB id, as if already resolved via ReferenceLookupService. */
    competitionIdsByTpId?: Map<number, number>;
  } = {},
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
  mocks.bootstrap.bootstrap.mockResolvedValue({
    ok: true,
    ids: [TP_SYSTEM_ID],
  });
  mocks.competitionGroupsImport.listCompetitionGroups.mockResolvedValue(
    'groups' in overrides ? overrides.groups : DEFAULT_GROUPS,
  );
  mocks.importResults.result.mockReturnValue(CANNED_RESULT);
  // Default: every key resolves to trophy 100, every award write succeeds.
  mocks.trophiesImport.upsertTrophy.mockResolvedValue(upsertedTrophy(100));
  mocks.trophyAwardsImport.upsertTrophyAward.mockResolvedValue(
    upsertedTrophyAward(500),
  );
  const competitionIdsByExternalId = new Map(
    [...(overrides.competitionIdsByTpId ?? new Map([[6543, 42]]))].map(
      ([tpId, id]) => [String(tpId), id],
    ),
  );
  const lookup = mockReferenceLookupService(new Map(), TP_SYSTEM_ID, {
    competitionIdsByExternalId,
  });

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
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(TpTrophyAwardsImportService),
    mocks,
  };
}

/** A canned full-row `upsertTrophy` response for a given id. */
function upsertedTrophy(id: number): Trophy & { created: boolean } {
  return {
    id,
    name: 'Some trophy',
    recipientKind: 'team',
    description: null,
    competitionGroupId: 1,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/** A canned full-row `upsertTrophyAward` response for a given id. */
function upsertedTrophyAward(id: number): TrophyAward & { created: boolean } {
  return {
    id,
    trophyId: 100,
    competitionId: 42,
    teamEraId: 70,
    playerId: null,
    createdAt: new Date('2026-01-01'),
    created: true,
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
    // Matches the tpId (6543) options()'s default competitionsByTpId entry
    // is keyed under, so the service's own competition-id resolution finds
    // it via the mocked ReferenceLookupService.
    externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: '6543' }],
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
    created: boolean;
  }> = {},
) {
  return {
    upsert: upsertCompetition(),
    era: 'Third era',
    competition: 'tloegbbl-major-season-25',
    competitionGroupId: 1,
    created: false,
    ...overrides,
  };
}

function options(
  overrides: Partial<ImportTpTrophyAwardsOptions> = {},
): ImportTpTrophyAwardsOptions {
  return {
    competitionsByTpId: new Map([[6543, competitionEntry()]]),
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

  it('keys the same award code in two competition groups as two trophies', async () => {
    // The award code alone is not a trophy: `1` means the Major Season gold
    // in one competition and the Chaos Cup win in another. Pinned because the
    // server-side group check added for issue #520 rejects any award whose
    // competition is in a different group than the resolved trophy -- so a
    // key that ignored the group would now fail at write time rather than
    // silently mis-attributing the award.
    const { service, mocks } = await makeService(
      new Map([
        ['Third era::tloegbbl-major-season-25', [award()]],
        ['Third era::tloegbbl-chaos-cup-8', [award()]],
      ]),
      {
        groups: [
          { id: 1, name: 'Major Season', leagueId: 1, createdAt: new Date() },
          { id: 2, name: 'Chaos Cup', leagueId: 1, createdAt: new Date() },
        ],
        competitionIdsByTpId: new Map([
          [6543, 42],
          [6544, 43],
        ]),
      },
    );
    // Distinct trophy ids per composite key: the default mock resolves every
    // lookup to the same trophy id, which cannot distinguish a swapped
    // trophy-to-competition attribution from a correct one.
    mocks.trophiesImport.upsertTrophy.mockImplementation((data) =>
      Promise.resolve(
        data.externalIds?.[0].externalId === '1-Major Season'
          ? upsertedTrophy(201)
          : upsertedTrophy(202),
      ),
    );

    await service.importTrophyAwards(
      options({
        competitionsByTpId: new Map([
          [6543, competitionEntry({ competitionGroupId: 1 })],
          [
            6544,
            competitionEntry({
              competitionGroupId: 2,
              competition: 'tloegbbl-chaos-cup-8',
              upsert: upsertCompetition({
                externalIds: [
                  { externalSystemId: TP_SYSTEM_ID, externalId: '6544' },
                ],
              }),
            }),
          ],
        ]),
      }),
    );

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
      {
        externalIds: [
          { externalSystemId: TP_SYSTEM_ID, externalId: '1-Major Season' },
        ],
      },
      expect.any(Array),
    );
    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledWith(
      {
        externalIds: [
          { externalSystemId: TP_SYSTEM_ID, externalId: '1-Chaos Cup' },
        ],
      },
      expect.any(Array),
    );
    // Pins the trophy-to-competition attribution itself, not just which
    // trophy keys were looked up: matches each award's competitionId against
    // its own group-scoped trophyId, so a swap between the two competitions
    // (or their resolved trophies) would fail this assertion.
    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      expect.objectContaining({ competitionId: 42, trophyId: 201 }),
      expect.any(Array),
    );
    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      expect.objectContaining({ competitionId: 43, trophyId: 202 }),
      expect.any(Array),
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
    const { service, mocks } = await makeService(awards([award()]), {
      competitionIdsByTpId: new Map(),
    });

    await service.importTrophyAwards(options());

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

  it('skips a competition that was newly created (not pre-seeded by curated data)', async () => {
    const { service, mocks } = await makeService(awards([award()]), {
      groups: DEFAULT_GROUPS,
    });

    await service.importTrophyAwards(
      options({
        competitionsByTpId: new Map([
          [6543, competitionEntry({ created: true })],
        ]),
      }),
    );

    expect(mocks.trophiesImport.upsertTrophy).not.toHaveBeenCalled();
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('6543');
    expect(errors[0].message).toContain('not pre-seeded');
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

  it('does not count an award whose trophy-award write resolves undefined', async () => {
    const { service, mocks } = await makeService(awards([award()]));
    mocks.trophyAwardsImport.upsertTrophyAward.mockResolvedValue(undefined);

    await service.importTrophyAwards(options());

    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('throws when a competition entry reaching trophy resolution has no eraId', async () => {
    const { service } = await makeService(awards([award()]));

    await expect(
      service.importTrophyAwards(
        options({
          competitionsByTpId: new Map([
            [
              6543,
              competitionEntry({
                upsert: upsertCompetition({ eraId: undefined }),
              }),
            ],
          ]),
        }),
      ),
    ).rejects.toThrow(/has no eraId/);
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

  it('scans a multi-era roster id and selects the entry matching the competition era, not the first', async () => {
    const { service, mocks } = await makeService(awards([award()]));

    await service.importTrophyAwards(
      options({
        teamErasByRosterId: new Map([
          [
            7,
            [
              { id: 70, eraId: 99 },
              { id: 71, eraId: 5 },
            ],
          ],
        ]),
      }),
    );

    expect(mocks.trophyAwardsImport.upsertTrophyAward).toHaveBeenCalledWith(
      expect.objectContaining({ teamEraId: 71 }),
      expect.anything(),
    );
  });

  it('reports awards in a directory whose competition was never imported at all', async () => {
    const { service, mocks } = await makeService(
      new Map([
        ['Third era::tloegbbl-major-season-25', [award()]],
        [
          'Third era::tloegbbl-chaos-cup-8',
          [award({ id: 2 }), award({ id: 3 })],
        ],
      ]),
    );

    await service.importTrophyAwards(options());

    expect(mocks.trophiesImport.upsertTrophy).toHaveBeenCalledTimes(1);
    const { errors, imported } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    const unmatched = errors.filter((error) =>
      error.message.includes('Third era::tloegbbl-chaos-cup-8'),
    );
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].message).toContain('Skipped 2 award row(s)');
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
