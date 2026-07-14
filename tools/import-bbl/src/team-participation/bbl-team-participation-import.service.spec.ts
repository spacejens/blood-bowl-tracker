import type {
  CompetitionsImportService,
  MatchesImportService,
  RulesSetsImportService,
  TeamsImportService,
  UpsertCompetitionData,
  UpsertRulesSetData,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { BblMatchDetailReaderService } from '../matches/bbl-match-detail-reader.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import { MatchMergeService } from '../matches/match-merge.service';
import type { MatchMergeConfigService } from '../matches/match-merge-config.service';
import type { BblMatchTeams } from '../matches/match-teams-page-parser';
import { BblTeamParticipationImportService } from './bbl-team-participation-import.service';

const erasConfig: EraConfig[] = [
  {
    name: 'BB2020',
    rulesSet: 'BB2020',
    startDate: '2021-09-01',
    firstPlayerId: 1,
  },
];

const eraIdsByName = new Map<string, number>([['BB2020', 200]]);

/** A fake match-list reader supplying canned matches (bblId + date) by competition id. */
function makeMatchListReader(
  matchesById: Record<string, { bblId: string; date: Date }[]>,
) {
  const getMatchesByCompetitionId = vi
    .fn()
    .mockResolvedValue(new Map(Object.entries(matchesById)));
  return { getMatchesByCompetitionId } as unknown as BblMatchListReaderService;
}

/** A fake match-detail reader mapping each match bblId to its two team ids. */
function makeMatchDetailReader(teamsByBblId: Record<string, BblMatchTeams>) {
  const getMatchTeamsByBblId = vi
    .fn()
    .mockResolvedValue(new Map(Object.entries(teamsByBblId)));
  return { getMatchTeamsByBblId } as unknown as BblMatchDetailReaderService;
}

function makeMergeService(
  matchesById: Record<string, { bblId: string; date: Date }[]>,
  merges: [string, string][] = [],
): MatchMergeService {
  const reader = new BblMatchListReaderService({} as never, {} as never);
  vi.spyOn(reader, 'getMatchesByCompetitionId').mockResolvedValue(
    new Map(Object.entries(matchesById)),
  );
  const mergeConfig = { getMerges: () => merges } as MatchMergeConfigService;
  return new MatchMergeService(reader, mergeConfig);
}

const home: UpsertTeamData = {
  name: 'Sewerton Scavengers',
  raceId: 5,
  coachId: 9,
  eras: [],
  externalIds: [{ externalSystemId: 1, externalId: 'sew' }],
};
const away: UpsertTeamData = {
  name: 'Vorgash New Order',
  raceId: 7,
  coachId: 9,
  eras: [],
  externalIds: [{ externalSystemId: 1, externalId: 'vor' }],
};

const competition: UpsertCompetitionData = {
  name: 'Major Season 1',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: 1, externalId: '1' }],
};

const rulesSet: UpsertRulesSetData = {
  name: 'BB2020',
  races: [],
  externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
};

const matchTeams = (
  bblId: string,
  homeTeamId: string,
  awayTeamId: string,
): BblMatchTeams => ({ bblId, homeTeamId, awayTeamId });

function makeService(opts: {
  matchListReader: BblMatchListReaderService;
  matchDetailReader: BblMatchDetailReaderService;
  upsertTeam: ReturnType<typeof vi.fn>;
  upsertCompetition: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
  upsertMatch?: ReturnType<typeof vi.fn>;
  matches?: Record<string, { bblId: string; date: Date }[]>;
}) {
  return new BblTeamParticipationImportService(
    opts.matchListReader,
    opts.matchDetailReader,
    { upsertTeam: opts.upsertTeam } as unknown as TeamsImportService,
    {
      upsertCompetition: opts.upsertCompetition,
    } as unknown as CompetitionsImportService,
    {
      upsertRulesSet: opts.upsertRulesSet,
    } as unknown as RulesSetsImportService,
    { getEras: () => erasConfig } as unknown as EraConfigService,
    {
      upsertMatch: opts.upsertMatch ?? vi.fn().mockResolvedValue(true),
    } as unknown as MatchesImportService,
    makeMergeService(opts.matches ?? {}, []),
  );
}

describe('BblTeamParticipationImportService', () => {
  it('syncs team eras, competition teams, and race rules sets from match team ids', async () => {
    const upsertTeam = vi
      .fn()
      .mockImplementation((data: UpsertTeamData) =>
        Promise.resolve(
          data.name === 'Sewerton Scavengers'
            ? { id: 1, eras: [{ id: 1001, eraId: 200 }] }
            : { id: 2, eras: [{ id: 1002, eraId: 200 }] },
        ),
      );
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'vor'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([
        ['sew', home],
        ['vor', away],
      ]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...home, eras: [200] },
      expect.any(Array),
    );
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001, 1002] },
      expect.any(Array),
    );
    expect(upsertRulesSet).toHaveBeenCalledWith(
      { ...rulesSet, races: [5, 7] },
      expect.any(Array),
    );
  });

  it('records an error and skips a team id it cannot resolve', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'unknown'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
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
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [
          { bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) },
          { bblId: 'm2', date: new Date(Date.UTC(2021, 9, 2)) },
        ],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'sew'),
        // m2 intentionally absent
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
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
    const upsertTeam = vi.fn();
    const upsertCompetition = vi.fn();
    const upsertRulesSet = vi.fn();

    const service = makeService({
      matchListReader: makeMatchListReader({}),
      matchDetailReader: makeMatchDetailReader({}),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(0);
    expect(upsertTeam).not.toHaveBeenCalled();
    expect(upsertCompetition).not.toHaveBeenCalled();
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('does not collect a team era id when a team upsert yields no result', async () => {
    const upsertTeam = vi
      .fn()
      .mockImplementation((data: UpsertTeamData) =>
        Promise.resolve(
          data.name === 'Sewerton Scavengers'
            ? { id: 1, eras: [{ id: 1001, eraId: 200 }] }
            : undefined,
        ),
      );
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'vor'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([
        ['sew', home],
        ['vor', away],
      ]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
  });

  it('does not re-upsert a rules set that is missing from the payload map', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn();

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'sew'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map(),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('does not upsert a competition when none of its match team ids resolve', async () => {
    const upsertTeam = vi.fn();
    const upsertCompetition = vi.fn();
    const upsertRulesSet = vi.fn();

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'unknown', 'unknown'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(0);
    expect(upsertCompetition).not.toHaveBeenCalled();
  });

  it('does not count a competition as imported when its upsert reports failure', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(false);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'sew'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(0);
    expect(upsertCompetition).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate a race id for a competition era with no configured rules set', async () => {
    const otherEraCompetition: UpsertCompetitionData = {
      ...competition,
      eraId: 999,
    };
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 999 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn();

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'sew'),
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', otherEraCompetition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('upserts match teams with both resolved team eras', async () => {
    const upsertTeam = vi
      .fn()
      .mockImplementation((data: UpsertTeamData) =>
        Promise.resolve(
          data.name === 'Sewerton Scavengers'
            ? { id: 1, eras: [{ id: 1001, eraId: 200 }] }
            : { id: 2, eras: [{ id: 1002, eraId: 200 }] },
        ),
      );
    const upsertMatch = vi.fn().mockResolvedValue(true);

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'vor'),
      }),
      upsertTeam,
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertRulesSet: vi.fn().mockResolvedValue({ id: 1 }),
      upsertMatch,
    });

    await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([
        ['sew', home],
        ['vor', away],
      ]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(upsertMatch).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 9, 1)),
        externalIds: [{ externalSystemId: 1, externalId: 'm1' }],
        teamEraIds: [1001, 1002],
      },
      expect.any(Array),
    );
  });

  it('records an error and skips match teams when a team era does not resolve', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertMatch = vi.fn().mockResolvedValue(true);

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'unknown'),
      }),
      upsertTeam,
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertRulesSet: vi.fn().mockResolvedValue({ id: 1 }),
      upsertMatch,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    expect(upsertMatch).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('could not resolve both team eras'),
      ),
    ).toBe(true);
  });

  it('records an error and skips match teams for a competition with no imported id', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertMatch = vi.fn().mockResolvedValue(true);

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [{ bblId: 'm1', date: new Date(Date.UTC(2021, 9, 1)) }],
      }),
      matchDetailReader: makeMatchDetailReader({
        m1: matchTeams('m1', 'sew', 'sew'),
      }),
      upsertTeam,
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertRulesSet: vi.fn().mockResolvedValue({ id: 1 }),
      upsertMatch,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['sew', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
      new Map(),
    );

    expect(upsertMatch).not.toHaveBeenCalled();
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

    const teamA1: UpsertTeamData = {
      name: 'A1',
      raceId: 1,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'a1' }],
    };
    const teamA2: UpsertTeamData = {
      name: 'A2',
      raceId: 2,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'a2' }],
    };
    const teamB1: UpsertTeamData = {
      name: 'B1',
      raceId: 3,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'b1' }],
    };
    const teamB2: UpsertTeamData = {
      name: 'B2',
      raceId: 4,
      coachId: 1,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: 'b2' }],
    };

    const upsertMatch = vi.fn().mockResolvedValue(true);
    const eraIdByCode: Record<string, number> = {
      a1: 11,
      a2: 12,
      b1: 13,
      b2: 14,
    };
    const upsertTeam = vi.fn((data: UpsertTeamData) =>
      Promise.resolve({
        eras: [
          {
            id: eraIdByCode[data.externalIds[0].externalId],
            eraId: data.eras?.[0],
          },
        ],
      }),
    );

    const service = new BblTeamParticipationImportService(
      makeMatchListReader({ '1': [matchA, matchB] }),
      makeMatchDetailReader({
        '1061': { bblId: '1061', homeTeamId: 'a1', awayTeamId: 'a2' },
        '1062': { bblId: '1062', homeTeamId: 'b1', awayTeamId: 'b2' },
      }),
      { upsertTeam } as unknown as TeamsImportService,
      {
        upsertCompetition: vi.fn().mockResolvedValue(true),
      } as unknown as CompetitionsImportService,
      {
        upsertRulesSet: vi.fn().mockResolvedValue(true),
      } as unknown as RulesSetsImportService,
      { getEras: () => erasConfig } as unknown as EraConfigService,
      { upsertMatch } as unknown as MatchesImportService,
      makeMergeService({ '1': [matchA, matchB] }, [['1061', '1062']]),
    );

    await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([
        ['a1', teamA1],
        ['a2', teamA2],
        ['b1', teamB1],
        ['b2', teamB2],
      ]),
      new Map(),
      eraIdsByName,
      new Map([['1', 42]]),
    );

    const matchCalls = upsertMatch.mock.calls.map(
      (c: unknown[]) => c[0] as { playedAt: Date; teamEraIds: number[] },
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
});
