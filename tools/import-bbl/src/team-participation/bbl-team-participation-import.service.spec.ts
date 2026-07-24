import type {
  UpsertCompetition,
  UpsertRace,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsImportService,
  ImportResultService,
  MatchesImportService,
  RacesImportService,
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
import { BblCompetitionStandingsReaderService } from './bbl-competition-standings-reader.service';
import { BblTeamParticipationImportService } from './bbl-team-participation-import.service';

const eraIdsByName = new Map<string, number>([['BB2020', 200]]);

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
 * collaborator mocked, seeded with the given fixture data. Deterministic
 * collaborators (error building) mirror the real production logic so a
 * regression in the service under test still fails these tests.
 */
async function makeService(opts: {
  matches?: Record<string, { bblId: string; date: Date }[]>;
  matchTeamsByBblId?: Record<string, BblMatchDetails>;
  standings?: Record<string, string[]>;
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
  matchesImport.upsertMatch.mockResolvedValue(true);

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
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

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

    const { result, eraIdsByRaceId } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledWith(
      { ...home, eras: [200] },
      expect.any(Array),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001, 1002] },
      expect.any(Array),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
      { ...orcRace, eras: [200] },
      expect.any(Array),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
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
      eraIdsByName,
      competitionIdsByBblId: new Map([
        ['1', 42],
        ['2', 43],
      ]),
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
    expect(
      result.errors.some((e) =>
        e.message.includes('could not resolve team id "unknown"'),
      ),
    ).toBe(true);
    expect(result.success).toBe(false);
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
    expect(
      result.errors.some((e) =>
        e.message.includes('could not find match details for match "m2"'),
      ),
    ).toBe(true);
  });

  it('skips a competition with no completed match rows', async () => {
    const { service, mocks } = await makeService({});

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.competitionsImport.upsertCompetition).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([
        ['sew', home],
        ['vor', away],
      ]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId: new Map(),
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).not.toHaveBeenCalled();
  });

  it('does not upsert a competition when none of its match team ids resolve', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'unknown', 'unknown') },
    });

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
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
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.matchesImport.upsertMatch).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 9, 1)),
        name: 'Match',
        externalIds: [{ externalSystemId: 1, externalId: 'm1' }],
        teamEraIds: [1001, 1002],
      },
      expect.any(Array),
    );
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.matchesImport.upsertMatch).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('could not resolve both team eras'),
      ),
    ).toBe(true);
  });

  it('records an error and skips match teams for a competition with no imported id', async () => {
    const { service, mocks } = await makeService({
      matches: { '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }] },
      matchTeamsByBblId: { m1: matchTeams('m1', 'sew', 'sew') },
    });
    mocks.teamsImport.upsertTeam.mockResolvedValue(
      makeTeamRecord({ id: 1, eras: [{ id: 1001, eraId: 200 }] }),
    );
    mocks.competitionsImport.upsertCompetition.mockResolvedValue(true);
    mocks.racesImport.upsertRace.mockResolvedValue(makeRaceRecord(1));

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map(),
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.matchesImport.upsertMatch).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
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
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    const matchCalls = mocks.matchesImport.upsertMatch.mock.calls.map(
      (c) => c[0] as { playedAt: Date; teamEraIds: number[] },
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledWith(
      { ...home, eras: [200] },
      expect.any(Array),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
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

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(1);
    // Set union dedupes 'sew': the team is upserted exactly once.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.competitionsImport.upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
  });

  it('records an error and skips a roster team code it cannot resolve', async () => {
    const { service, mocks } = await makeService({
      standings: { '1': ['ghost'] },
    });

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('could not resolve team id "ghost"'),
      ),
    ).toBe(true);
  });

  it('does not redundantly re-sync a competition with zero matches and zero registered teams (its row, with empty teamEraIds, was already created by BblCompetitionsImportService)', async () => {
    const { service, mocks } = await makeService({ standings: {} });

    const { result } = await service.importTeamParticipation({
      competitionsByBblId: new Map([['1', competition]]),
      teamsByCode: new Map([['sew', home]]),
      racesByRaceId,
      eraIdsByName,
      competitionIdsByBblId: new Map([['1', 42]]),
    });

    expect(result.imported).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.competitionsImport.upsertCompetition).not.toHaveBeenCalled();
  });
});
