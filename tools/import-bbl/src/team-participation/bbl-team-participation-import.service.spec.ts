import type {
  UpsertCompetition,
  UpsertMatch,
  UpsertRace,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type {
  BatchBuffer,
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ImportResultService,
  MatchesImportService,
  RacesImportService,
  ReferenceLookupService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblMatchDetailReaderService } from '../matches/bbl-match-detail-reader.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { MatchMergeResolution } from '../matches/match-merge.service';
import { MatchMergeService } from '../matches/match-merge.service';
import type { BblMatchDetails } from '../matches/match-teams-page-parser';
import { mockReferenceLookup } from '../shared/reference-lookup-mock.test-helpers';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { BblCompetitionStandingsReaderService } from './bbl-competition-standings-reader.service';
import { BblTeamParticipationImportService } from './bbl-team-participation-import.service';

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

/** A resolution with no merged pairs: every match uses its own raw date. */
function noMergeResolution(): MatchMergeResolution {
  return {
    primaryBblIdByBblId: new Map(),
    partnerBblId: () => undefined,
    isPrimary: () => false,
    isSecondary: () => false,
    effectivePlayedAt: (_bblId, rawDate) => rawDate,
  };
}

interface Mocks {
  matchListReader: MockProxy<BblMatchListReaderService>;
  matchDetailReader: MockProxy<BblMatchDetailReaderService>;
  teamsImport: MockProxy<TeamsImportService>;
  competitionsImport: MockProxy<CompetitionsImportService>;
  racesImport: MockProxy<RacesImportService>;
  matchesImport: MockProxy<MatchesImportService>;
  matchMerge: MockProxy<MatchMergeService>;
  standingsReader: MockProxy<BblCompetitionStandingsReaderService>;
  importResults: MockProxy<ImportResultService>;
  upsertFieldNarrowing: MockProxy<UpsertFieldNarrowingService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * The full upsertTeam result record (TeamsImportService.upsertTeam resolves
 * the API's Team + created shape). The subject under test only reads `.id`
 * and `.eras`, so the other fields are unremarkable defaults.
 */
function makeTeamRecord(overrides: {
  id: number;
  eras: { id: number; eraId: number }[];
}) {
  return {
    name: 'Team',
    raceId: 5,
    coachId: 9,
    createdAt: new Date('2026-01-01'),
    created: true,
    ...overrides,
  };
}

/**
 * The full upsertRace result record (RacesImportService.upsertRace resolves
 * the API's Race + created shape). The subject under test only reads `.id`,
 * so the other fields are unremarkable defaults.
 */
function makeRaceRecord(id: number) {
  return {
    id,
    name: 'Race',
    eras: [],
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked, seeded with the given fixture data.
 * ImportResultService.result returns a canned value (see CANNED_RESULT
 * above); tests assert what this service passes to it, not what it computes.
 */
async function makeService(opts: {
  matches?: Record<string, { bblId: string; date: Date }[]>;
  matchTeamsByBblId?: Record<string, BblMatchDetails>;
  standings?: Record<string, string[]>;
  competitionIdsByBblId?: Map<string, number>;
}): Promise<{ service: BblTeamParticipationImportService; mocks: Mocks }> {
  const matchListReader = mock<BblMatchListReaderService>();
  matchListReader.getMatchesByCompetitionId.mockResolvedValue(
    new Map(Object.entries(opts.matches ?? {})),
  );

  const matchDetailReader = mock<BblMatchDetailReaderService>();
  matchDetailReader.getMatchTeamsByBblId.mockResolvedValue(
    new Map(Object.entries(opts.matchTeamsByBblId ?? {})),
  );

  const teamsImport = mock<TeamsImportService>();
  const competitionsImport = mock<CompetitionsImportService>();
  const racesImport = mock<RacesImportService>();

  const matchesImport = mock<MatchesImportService>();
  matchesImport.createBatch.mockReturnValue({
    pending: [],
  } as unknown as BatchBuffer<UpsertMatch>);
  matchesImport.addToBatch.mockResolvedValue(0);
  matchesImport.flushBatch.mockResolvedValue(0);

  const matchMerge = mock<MatchMergeService>();
  matchMerge.resolve.mockResolvedValue(noMergeResolution());

  const standingsReader = mock<BblCompetitionStandingsReaderService>();
  standingsReader.getRegisteredTeamIdsByCompetitionId.mockResolvedValue(
    new Map(
      Object.entries(opts.standings ?? {}).map(([id, codes]) => [
        id,
        new Set(codes),
      ]),
    ),
  );

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const upsertFieldNarrowing = mock<UpsertFieldNarrowingService>();
  // Every competition/team fixture in this spec has a defined eraId/raceId,
  // so the mock simply passes the value through rather than re-deriving the
  // throw-if-undefined invariant, which is covered by the real service's own
  // spec.
  upsertFieldNarrowing.resolveDefiniteEraId.mockImplementation(
    (c) => c.eraId as number,
  );
  upsertFieldNarrowing.resolveDefiniteRaceId.mockImplementation(
    (t) => t.raceId as number,
  );

  const lookup = mock<ReferenceLookupService>();
  mockReferenceLookup(lookup, {
    competition: opts.competitionIdsByBblId ?? new Map([['1', 42]]),
  });

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblTeamParticipationImportService,
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: BblMatchDetailReaderService, useValue: matchDetailReader },
      { provide: TeamsImportService, useValue: teamsImport },
      { provide: CompetitionsImportService, useValue: competitionsImport },
      { provide: RacesImportService, useValue: racesImport },
      { provide: MatchesImportService, useValue: matchesImport },
      { provide: MatchMergeService, useValue: matchMerge },
      {
        provide: BblCompetitionStandingsReaderService,
        useValue: standingsReader,
      },
      { provide: ImportResultService, useValue: importResults },
      {
        provide: UpsertFieldNarrowingService,
        useValue: upsertFieldNarrowing,
      },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblTeamParticipationImportService),
    mocks: {
      matchListReader,
      matchDetailReader,
      teamsImport,
      competitionsImport,
      racesImport,
      matchesImport,
      matchMerge,
      standingsReader,
      importResults,
      upsertFieldNarrowing,
      lookup,
    },
  };
}

const home: UpsertTeam = {
  name: 'Sewerton Scavengers',
  raceId: 5,
  coachId: 9,
  eras: [],
  externalIds: [{ externalSystemId: 1, externalId: 'sew' }],
};
const away: UpsertTeam = {
  name: 'Vorgash New Order',
  raceId: 7,
  coachId: 9,
  eras: [],
  externalIds: [{ externalSystemId: 1, externalId: 'vor' }],
};

const competition: UpsertCompetition = {
  name: 'Major Season 1',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: 1, externalId: '1' }],
};

const orcRace: UpsertRace = {
  name: 'Orc',
  eras: [],
  externalIds: [{ externalSystemId: 1, externalId: '5' }],
};
const vampireRace: UpsertRace = {
  name: 'Vampire',
  eras: [],
  externalIds: [{ externalSystemId: 1, externalId: '7' }],
};
const racesByRaceId = new Map<number, UpsertRace>([
  [5, orcRace],
  [7, vampireRace],
]);

const matchTeams = (
  bblId: string,
  homeTeamId: string,
  awayTeamId: string,
): BblMatchDetails => ({ bblId, homeTeamId, awayTeamId, name: 'Match' });

describe('BblTeamParticipationImportService', () => {
  it('syncs team eras, competition teams, and race eras from match team ids', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'vor') },
    });
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        data.name === 'Sewerton Scavengers'
          ? makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] })
          : makeTeamRecord({ id: 2, eras: [{ id: 1002, eraId: 200 }] }),
      ),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    const { eraIdsByRaceId } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledWith(
      { ...home, eras: [200] },
      expect.any(Array),
    );
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001, 1002] },
      expect.any(Array),
    );
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
      { ...orcRace, eras: [200] },
      expect.any(Array),
    );
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
      { ...vampireRace, eras: [200] },
      expect.any(Array),
    );
    expect(eraIdsByRaceId).toEqual(
      new Map([
        [5, new Set([200])],
        [7, new Set([200])],
      ]),
    );
  });

  it("reports each competition's team code to team era mapping", async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'vor') },
    });
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        data.name === 'Sewerton Scavengers'
          ? makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] })
          : makeTeamRecord({ id: 2, eras: [{ id: 1002, eraId: 200 }] }),
      ),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    const { teamEraIdsByCompetitionBblId } =
      await service.importTeamParticipation({
        competitionsByBblId: new Map([['1', competition]]),
        teamsByCode: new Map([
          ['sew', home],
          ['vor', away],
        ]),
        racesByRaceId,
      });

    expect(teamEraIdsByCompetitionBblId.get('1')?.get('sew')).toBe(1001);
    expect(teamEraIdsByCompetitionBblId.get('1')?.get('vor')).toBe(1002);
  });

  it('re-upserts each race that participated, with the set of eras it appeared in', async () => {
    const otherEraCompetition: UpsertCompetition = {
      ...competition,
      name: 'Major Season 2',
      eraId: 999,
      externalIds: [{ externalSystemId: 1, externalId: '2' }],
    };
    const { service, mocks } = await makeService({
      matches: {
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
        '2': [{ bblId: 'm2', date: new Date(Date.UTC(2022, 9, 1)) }],
      },
      matchTeamsByBblId: {
        m1: matchTeams('m1', 'sew', 'sew'),
        m2: matchTeams('m2', 'sew', 'sew'),
      },
    });
    mocks.teamsImport.upsertTeam.mockImplementation((data) => {
      const eraId = data.eras?.[0] ?? 0;
      return Promise.resolve(
        data.name === 'Sewerton Scavengers'
          ? makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId }] })
          : makeTeamRecord({ id: 2, eras: [{ id: 1002, eraId }] }),
      );
    });
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([
        ['1', competition],
        ['2', otherEraCompetition],
      ]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
      { ...orcRace, eras: [200, 999] },
      expect.any(Array),
    );
  });

  it('records an error and skips a team id it cannot resolve', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'unknown') },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledTimes(1);
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
    expect(
      errors.some((e) =>
        e.message.includes('could not resolve team id "unknown"'),
      ),
    ).toBe(true);
  });

  it('records an error and skips a match with no match-detail entry, importing the rest', async () => {
    const { service, mocks } = await makeService({
      matches: {
        '1': [
          { bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) },
          { bblId: 'm2', date: new Date(Date.UTC(2021, 9, 2)) },
        ],
      },
      matchTeamsByBblId: {
        m1: matchTeams('m1', 'sew', 'sew'),
        // m2 intentionally absent
      },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
    expect(
      errors.some((e) =>
        e.message.includes('could not find match details for match "m2"'),
      ),
    ).toBe(true);
  });

  it('skips a competition with no completed match rows', async () => {
    const { service, mocks } = await makeService({});

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(mocks.competitionsImport.upsertCompetition).not.toHaveBeenCalled();
    expect(mocks.racesImport.upsertRace).not.toHaveBeenCalled();
  });

  it('does not collect a team era id when a team upsert yields no result', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'vor') },
    });
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        data.name === 'Sewerton Scavengers'
          ? makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] })
          : undefined,
      ),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
  });

  it('does not re-upsert a race that is missing from the payload map', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'sew') },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId: new Map(),
    });

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.racesImport.upsertRace).not.toHaveBeenCalled();
  });

  it('does not upsert a competition when none of its match team ids resolve', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'unknown', 'unknown') },
    });

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.competitionsImport.upsertCompetition).not.toHaveBeenCalled();
  });

  it('does not count a competition as imported when its upsert reports failure', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'sew') },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(false);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledTimes(1);
  });

  it('upserts match teams with both resolved team eras', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'vor') },
    });
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        data.name === 'Sewerton Scavengers'
          ? makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] })
          : makeTeamRecord({ id: 2, eras: [{ id: 1002, eraId: 200 }] }),
      ),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
    });

    expect(mocks.matchesImport.addToBatch).toHaveBeenCalledWith(
      expect.anything(),
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 9, 1)),
        name: 'Match',
        externalIds: [{ externalSystemId: 1, externalId: 'm1' }],
        teamEraIds: [1001, 1002],
      },
    );
  });

  it('buffers each match-teams re-upsert and flushes once at the end', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'vor') },
    });
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        data.name === 'Sewerton Scavengers'
          ? makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] })
          : makeTeamRecord({ id: 2, eras: [{ id: 1002, eraId: 200 }] }),
      ),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    const batch = { pending: [] } as unknown as BatchBuffer<UpsertMatch>;
    const captured: UpsertMatch[] = [];
    mocks.matchesImport.createBatch.mockReturnValue(batch);
    mocks.matchesImport.addToBatch.mockImplementation((_batch, data) => {
      captured.push(data);
      return Promise.resolve(0);
    });
    mocks.matchesImport.flushBatch.mockResolvedValue(0);

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
    });

    expect(mocks.matchesImport.createBatch).toHaveBeenCalledTimes(1);
    expect(mocks.matchesImport.upsertMatch).not.toHaveBeenCalled();
    expect(captured).toEqual([
      expect.objectContaining({
        teamEraIds: [1001, 1002],
      }),
    ]);
    expect(mocks.matchesImport.flushBatch).toHaveBeenCalledWith(batch);
  });

  it('records an error and skips match teams when a team era does not resolve', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'unknown') },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(mocks.matchesImport.addToBatch).not.toHaveBeenCalled();
    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('could not resolve both team eras'),
      ),
    ).toBe(true);
  });

  it('records an error and skips match teams for a competition with no imported id', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'sew') },
      competitionIdsByBblId: new Map(),
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(mocks.matchesImport.addToBatch).not.toHaveBeenCalled();
    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('no imported competition id'),
      ),
    ).toBe(true);
  });

  it('uses the canonical playedAt for both members of a merged pair and unions their teams', async () => {
    // Two source matches in competition '1', four distinct teams.
    const matchA = { bblId: '1061', date: new Date(Date.UTC(2016, 8, 25)) };
    const matchB = { bblId: '1062', date: new Date(Date.UTC(2016, 8, 24)) };

    const teamA1: UpsertTeam = {
      name: 'A1',
      raceId: 1,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'a1' }],
    };
    const teamA2: UpsertTeam = {
      name: 'A2',
      raceId: 2,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'a2' }],
    };
    const teamB1: UpsertTeam = {
      name: 'B1',
      raceId: 3,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'b1' }],
    };
    const teamB2: UpsertTeam = {
      name: 'B2',
      raceId: 4,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'b2' }],
    };

    const { service, mocks } = await makeService({
      matches: { '1': [matchA, matchB] },
      matchTeamsByBblId: {
        '1061': {
          bblId: '1061',
          homeTeamId: 'a1',
          awayTeamId: 'a2',
          name: 'Match',
        },
        '1062': {
          bblId: '1062',
          homeTeamId: 'b1',
          awayTeamId: 'b2',
          name: 'Match',
        },
      },
    });
    const eraIdByCode: Record<string, number> = {
      a1: 11,
      a2: 12,
      b1: 13,
      b2: 14,
    };
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        makeTeamRecord({
          id: 0,
          eras: [
            {
              id: eraIdByCode[data.externalIds[0].externalId],
              eraId: data.eras?.[0] ?? 0,
            },
          ],
        }),
      ),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));
    // Both pair members resolve to the earliest of the pair's two dates.
    mocks.matchMerge.resolve.mockResolvedValue({
      ...noMergeResolution(),
      effectivePlayedAt: (bblId, rawDate) =>
        bblId === '1061' || bblId === '1062' ? matchB.date : rawDate,
    });

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['a1', teamA1],
        ['a2', teamA2],
        ['b1', teamB1],
        ['b2', teamB2],
      ]),
      racesByRaceId,
    });

    const matchCalls = mocks.matchesImport.addToBatch.mock.calls.map(
      (c) => c[1] as { playedAt: Date; teamEraIds: number[] },
    );
    expect(matchCalls).toHaveLength(2);
    // Both members use the earliest of the pair's dates (2016-09-24).
    for (const call of matchCalls) {
      expect(call.playedAt).toEqual(new Date(Date.UTC(2016, 8, 24)));
    }
    // Union of both calls' teamEraIds covers all four teams.
    const allTeamEraIds = new Set(matchCalls.flatMap((c) => c.teamEraIds));
    expect(allTeamEraIds).toEqual(new Set([11, 12, 13, 14]));
  });

  it('links a team present only in the standings roster (zero matches)', async () => {
    // No matches at all for competition '1'; the roster is the only source.
    const { service, mocks } = await makeService({
      standings: { '1': ['sew'] },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 3, eras: [{ id: 1003, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledWith(
      { ...home, eras: [200] },
      expect.any(Array),
    );
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1003] },
      expect.any(Array),
    );
  });

  it('does not double-process a team present in both matches and the roster', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'sew') },
      standings: { '1': ['sew'] },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    // Set union dedupes 'sew': the team is upserted exactly once.
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledTimes(1);
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
  });

  it('records an error and skips a roster team code it cannot resolve', async () => {
    const { service, mocks } = await makeService({
      standings: { '1': ['ghost'] },
    });

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      errors.some((e) =>
        e.message.includes('could not resolve team id "ghost"'),
      ),
    ).toBe(true);
  });

  it('does not redundantly re-sync a competition with zero matches and zero registered teams (its row, with empty teamEraIds, was already created by BblCompetitionsImportService)', async () => {
    const { service, mocks } = await makeService({ standings: {} });

    await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
    });

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.competitionsImport.upsertCompetition).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'vor') },
    });

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
    });

    expect(result).toBe(CANNED_RESULT);
  });
});
