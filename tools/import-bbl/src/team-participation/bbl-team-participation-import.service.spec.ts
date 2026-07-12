import type {
  CompetitionsImportService,
  RulesSetsImportService,
  TeamsImportService,
  UpsertCompetitionData,
  UpsertRulesSetData,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
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

/** A fake match-list reader returning the given canned matches by competition id. */
function makeMatchListReader(
  matchesById: Record<
    string,
    { bblId: string; date: Date; homeTeam: string; awayTeam: string }[]
  >,
) {
  const getMatchesByCompetitionId = vi
    .fn()
    .mockResolvedValue(new Map(Object.entries(matchesById)));
  return { getMatchesByCompetitionId } as unknown as BblMatchListReaderService;
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

function makeService(opts: {
  matchListReader: BblMatchListReaderService;
  upsertTeam: ReturnType<typeof vi.fn>;
  upsertCompetition: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
}) {
  return new BblTeamParticipationImportService(
    opts.matchListReader,
    { upsertTeam: opts.upsertTeam } as unknown as TeamsImportService,
    {
      upsertCompetition: opts.upsertCompetition,
    } as unknown as CompetitionsImportService,
    {
      upsertRulesSet: opts.upsertRulesSet,
    } as unknown as RulesSetsImportService,
    { getEras: () => erasConfig } as unknown as EraConfigService,
  );
}

describe('BblTeamParticipationImportService', () => {
  it('syncs team eras, competition teams, and race rules sets from match rows', async () => {
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
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: 'Vorgash New Order',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([
        ['Sewerton Scavengers', home],
        ['Vorgash New Order', away],
      ]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
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

  it('records an error and skips a match-row team name it cannot resolve', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: 'Unknown Team',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition, teamEraIds: [1001] },
      expect.any(Array),
    );
    expect(result.errors.some((e) => e.message.includes('Unknown Team'))).toBe(
      true,
    );
    expect(result.success).toBe(false);
  });

  it('skips a competition with no completed match rows', async () => {
    const upsertTeam = vi.fn();
    const upsertCompetition = vi.fn();
    const upsertRulesSet = vi.fn();

    const service = makeService({
      matchListReader: makeMatchListReader({}),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
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
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: 'Vorgash New Order',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([
        ['Sewerton Scavengers', home],
        ['Vorgash New Order', away],
      ]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
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
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: 'Sewerton Scavengers',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map(),
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('does not upsert a competition when none of its match-row teams resolve', async () => {
    const upsertTeam = vi.fn();
    const upsertCompetition = vi.fn();
    const upsertRulesSet = vi.fn();

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Unknown Team',
            awayTeam: 'Unknown Team',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
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
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: 'Sewerton Scavengers',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(upsertCompetition).toHaveBeenCalledTimes(1);
  });

  it('ignores a blank team name on a match row', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      matchListReader: makeMatchListReader({
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: '',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledTimes(1);
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
        '1': [
          {
            bblId: 'm1',
            date: new Date(Date.UTC(2021, 9, 1)),
            homeTeam: 'Sewerton Scavengers',
            awayTeam: 'Sewerton Scavengers',
          },
        ],
      }),
      upsertTeam,
      upsertCompetition,
      upsertRulesSet,
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', otherEraCompetition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });
});
