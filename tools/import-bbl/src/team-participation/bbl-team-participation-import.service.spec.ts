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
import { MatchListPageParser } from '../matches/match-list-page-parser';
import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import { BblTeamParticipationImportService } from './bbl-team-participation-import.service';

const erasConfig: EraConfig[] = [
  { name: 'BB2020', rulesSet: 'BB2020', startDate: '2021-09-01' },
];

const eraIdsByName = new Map<string, number>([['BB2020', 200]]);

function page(type: string, params: Record<string, string>): BblPage {
  return {
    type,
    params,
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeReader(pagesByType: Record<string, BblPage[]>): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(type: string) {
      for (const p of pagesByType[type] ?? []) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

/** A match parser mapping a page's `s` param to canned matches. */
function makeMatchParser(
  matchesById: Record<
    string,
    { date: Date; homeTeam: string; awayTeam: string }[]
  >,
) {
  const parser = new MatchListPageParser();
  vi.spyOn(parser, 'extractMatches').mockImplementation(
    (p) => matchesById[p.params.s] ?? [],
  );
  return parser;
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
  reader: BblSourceReader;
  matchParser: MatchListPageParser;
  upsertTeam: ReturnType<typeof vi.fn>;
  upsertCompetition: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
}) {
  return new BblTeamParticipationImportService(
    opts.reader,
    opts.matchParser,
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
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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
      reader: makeReader({ ma: [] }),
      matchParser: makeMatchParser({}),
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

  it('records an error and continues when a match-list page fails to parse', async () => {
    const matchParser = new MatchListPageParser();
    vi.spyOn(matchParser, 'extractMatches').mockImplementation(() => {
      throw new Error('bad ma page');
    });
    const service = makeService({
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser,
      upsertTeam: vi.fn(),
      upsertCompetition: vi.fn(),
      upsertRulesSet: vi.fn(),
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse match list page'),
      ),
    ).toBe(true);
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
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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

  it('skips ma pages that are not the season-sorted variant or a repeat of a competition already collected', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      reader: makeReader({
        ma: [
          page('ma', { so: 'gr', s: '1' }),
          page('ma', { so: 's', s: '1' }),
          page('ma', { so: 's', s: '1' }),
        ],
      }),
      matchParser: makeMatchParser({
        '1': [
          {
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

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledTimes(1);
  });

  it('does not upsert a competition when none of its match-row teams resolve', async () => {
    const upsertTeam = vi.fn();
    const upsertCompetition = vi.fn();
    const upsertRulesSet = vi.fn();

    const service = makeService({
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser: makeMatchParser({
        '1': [
          {
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

  it('ignores a page with no competition id and blank team names on a match row', async () => {
    const upsertTeam = vi
      .fn()
      .mockResolvedValue({ id: 1, eras: [{ id: 1001, eraId: 200 }] });
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 1 });

    const service = makeService({
      reader: makeReader({
        ma: [page('ma', { so: 's' }), page('ma', { so: 's', s: '1' })],
      }),
      matchParser: makeMatchParser({
        '1': [
          {
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

  it('records a non-Error thrown value when a match-list page fails to parse', async () => {
    const matchParser = new MatchListPageParser();
    vi.spyOn(matchParser, 'extractMatches').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad ma page';
    });
    const service = makeService({
      reader: makeReader({ ma: [page('ma', { so: 's', s: '1' })] }),
      matchParser,
      upsertTeam: vi.fn(),
      upsertCompetition: vi.fn(),
      upsertRulesSet: vi.fn(),
    });

    const { result } = await service.importTeamParticipation(
      new Map([['1', competition]]),
      new Map([['Sewerton Scavengers', home]]),
      new Map([['BB2020', rulesSet]]),
      eraIdsByName,
    );

    expect(result.errors.some((e) => e.message.includes('bad ma page'))).toBe(
      true,
    );
  });
});
