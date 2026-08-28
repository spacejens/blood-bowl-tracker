import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  ReferenceLookupService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CoachPageParser } from '../coaches/coach-page-parser';
import { RacePageParser } from '../races/race-page-parser';
import { mockBblSourceReader } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblTeamsImportService } from './bbl-teams-import.service';
import { TeamPageParser } from './team-page-parser';

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

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
const BBL_SYSTEM_ID = 1;

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
 * only what BblTeamsImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

/**
 * A fake team page carrying the team id/name, the race's BBL id, and the coach
 * name in params for the stub parsers.
 */
function page(opts: {
  teamId?: string;
  teamName?: string;
  raceBblId?: string;
  coachName?: string;
}): BblPage {
  return {
    type: 'tm',
    params: {
      t: opts.teamId ?? '',
      teamName: opts.teamName ?? '',
      raceBblId: opts.raceBblId ?? '',
      coachName: opts.coachName ?? '',
    },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

interface Mocks {
  teamParser: MockProxy<TeamPageParser>;
  raceParser: MockProxy<RacePageParser>;
  coachParser: MockProxy<CoachPageParser>;
  teamsImport: MockProxy<TeamsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * The full upsert result record (TeamsImportService.upsert resolves
 * the API's Team + created shape). This service only checks the result's
 * truthiness, so the field values are unremarkable defaults.
 */
function makeTeamRecord() {
  return {
    id: 1,
    name: 'Team',
    raceId: 500,
    coachId: 900,
    eras: [],
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblTeamsImportService; mocks: Mocks }> {
  const teamParser = mock<TeamPageParser>();
  teamParser.extractTeam.mockImplementation((p) =>
    p.params.t ? { id: p.params.t, name: p.params.teamName } : null,
  );

  const raceParser = mock<RacePageParser>();
  raceParser.extractRace.mockImplementation((p) =>
    p.params.raceBblId ? { id: p.params.raceBblId, name: 'RaceName' } : null,
  );

  const coachParser = mock<CoachPageParser>();
  coachParser.extractCoach.mockImplementation((p) =>
    p.params.coachName ? { name: p.params.coachName } : null,
  );

  const teamsImport = mock<TeamsImportService>();
  teamsImport.upsert.mockResolvedValue(makeTeamRecord());

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  // `forTeam` is a pure identity passthrough with no branching or formatting,
  // so there is no algorithm here that can drift out of sync with the real
  // NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forTeam.mockImplementation((name) => name);

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

  const lookup = mock<ReferenceLookupService>();
  // `keyOf` is a pure, deterministic key derivation with no branching that
  // could drift from ReferenceLookupService's own real implementation --
  // exempt from the canned-response rule, same as the other passthroughs.
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
  lookup.lookupMap.mockImplementation((kind) =>
    Promise.resolve(
      kind === 'race'
        ? new Map([[`${BBL_SYSTEM_ID}\t16`, 500]])
        : new Map([[`${BBL_SYSTEM_ID}\tHugo E`, 900]]),
    ),
  );

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblTeamsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: TeamPageParser, useValue: teamParser },
      { provide: RacePageParser, useValue: raceParser },
      { provide: CoachPageParser, useValue: coachParser },
      { provide: TeamsImportService, useValue: teamsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblTeamsImportService),
    mocks: {
      teamParser,
      raceParser,
      coachParser,
      teamsImport,
      bootstrap,
      nameConfig,
      nameExternalId,
      importResults,
      pageParseError,
      lookup,
    },
  };
}

describe('BblTeamsImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts the configured BBL system name when set', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importTeams();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts a team with its resolved raceId/coachId and page-id + name external IDs', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { teamsByCode } = await service.importTeams();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      {
        name: '40 grinders',
        raceId: 500,
        coachId: 900,
        eras: [],
        externalIds: [
          { externalSystemId: 1, externalId: '40g' },
          { externalSystemId: 2, externalId: '40 grinders' },
        ],
      },
      expect.any(Array),
    );
    expect(teamsByCode.get('40g')).toEqual({
      name: '40 grinders',
      raceId: 500,
      coachId: 900,
      eras: [],
      externalIds: [
        { externalSystemId: 1, externalId: '40g' },
        { externalSystemId: 2, externalId: '40 grinders' },
      ],
    });
  });

  it("resolves each team's race and coach in one batched call per kind", async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams();

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('race', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: '16' },
    ]);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('coach', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'Hugo E' },
    ]);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(2);
  });

  it('deduplicates a team (by id) appearing on multiple pages', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams();

    expect(mocks.teamsImport.upsert).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });

  it('skips pages with no team', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page({ raceBblId: '16', coachName: 'Hugo E' })]),
    );

    await service.importTeams();

    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('records an error and skips a team whose race id is not in the map', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '999',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams();

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team with no race on the page', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({ teamId: '40g', teamName: '40 grinders', coachName: 'Hugo E' }),
      ]),
    );

    await service.importTeams();

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team whose coach name is not in the map', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Nobody',
        }),
      ]),
    );

    await service.importTeams();

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('records an error and skips a team with no coach on the page', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({ teamId: '40g', teamName: '40 grinders', raceBblId: '16' }),
      ]),
    );

    await service.importTeams();

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('records an error and continues when a team upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );
    mocks.teamsImport.upsert.mockImplementationOnce((_data, errors) => {
      errors.push({
        item: {},
        message: 'Failed to import team "40 grinders"',
      });
      return Promise.resolve(undefined);
    });

    await service.importTeams();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors.some((e) => e.message.includes('40 grinders'))).toBe(true);
  });

  it('records an error and continues when a page fails to parse', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page({ teamId: '40g', teamName: '40 grinders' })]),
    );
    mocks.teamParser.extractTeam.mockImplementation(() => {
      throw new Error('bad page');
    });

    await service.importTeams();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { t: '40g', teamName: '40 grinders', raceBblId: '', coachName: '' },
      'team',
      new Error('bad page'),
    );
  });

  it('passes a non-Error thrown team-page value straight through to PageParseErrorService', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page({ teamId: '40g', teamName: '40 grinders' })]),
    );
    mocks.teamParser.extractTeam.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    await service.importTeams();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { t: '40g', teamName: '40 grinders', raceBblId: '', coachName: '' },
      'team',
      'bad page',
    );
  });

  it('records one error and skips teams when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importTeams();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
  });

  it('returns a map from each team page code to its resolved race id', async () => {
    const { service } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { teamRaceIdsByCode } = await service.importTeams();

    expect(teamRaceIdsByCode.get('40g')).toBe(500);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService(
      mockBblSourceReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { result } = await service.importTeams();

    expect(result).toBe(CANNED_RESULT);
  });
});
