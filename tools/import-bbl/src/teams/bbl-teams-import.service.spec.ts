import type {
  ExternalSystemBootstrapService,
  ImportError,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import { CoachPageParser } from '../coaches/coach-page-parser';
import { RacePageParser } from '../races/race-page-parser';
import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblTeamsImportService } from './bbl-teams-import.service';
import { TeamPageParser } from './team-page-parser';

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

/** A source reader whose pages() yields the given fake pages. */
function makeReader(pages: BblPage[]): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages() {
      for (const p of pages) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function makeTeamParser(): TeamPageParser {
  const parser = new TeamPageParser();
  vi.spyOn(parser, 'extractTeam').mockImplementation((p) =>
    p.params.t ? { id: p.params.t, name: p.params.teamName } : null,
  );
  return parser;
}

function makeRaceParser(): RacePageParser {
  const parser = new RacePageParser();
  vi.spyOn(parser, 'extractRace').mockImplementation((p) =>
    p.params.raceBblId ? { id: p.params.raceBblId, name: 'RaceName' } : null,
  );
  return parser;
}

function makeCoachParser(): CoachPageParser {
  const parser = new CoachPageParser();
  vi.spyOn(parser, 'extractCoach').mockImplementation((p) =>
    p.params.coachName ? { name: p.params.coachName } : null,
  );
  return parser;
}

interface MakeServiceOptions {
  reader: BblSourceReader;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertTeam: ReturnType<typeof vi.fn>;
  parsers?: {
    team?: TeamPageParser;
    race?: RacePageParser;
    coach?: CoachPageParser;
  };
  getBblSystemName?: () => string;
}

function makeService({
  reader,
  bootstrap,
  upsertTeam,
  parsers,
  getBblSystemName = () => 'BBL',
}: MakeServiceOptions) {
  return new BblTeamsImportService(
    reader,
    parsers?.team ?? makeTeamParser(),
    parsers?.race ?? makeRaceParser(),
    parsers?.coach ?? makeCoachParser(),
    { upsertTeam } as unknown as TeamsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
  );
}

const raceIds = new Map<string, number>([['16', 500]]);
const coachIds = new Map<string, number>([['Hugo E', 900]]);

describe('BblTeamsImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    await service.importTeams(raceIds, coachIds);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', isBookkeeping: false },
      { name: 'Name', isBookkeeping: true },
    ]);
  });

  it('upserts the configured BBL system name when set', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
      parsers: undefined,
      getBblSystemName: () => 'MyLeague',
    });

    await service.importTeams(raceIds, coachIds);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', isBookkeeping: false },
      { name: 'Name', isBookkeeping: true },
    ]);
  });

  it('upserts a team with its resolved raceId/coachId and page-id + name external IDs', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result, teamsByName } = await service.importTeams(
      raceIds,
      coachIds,
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
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
    expect(teamsByName.get('40 grinders')).toEqual({
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

  it('deduplicates a team (by id) appearing on multiple pages', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
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
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('skips pages with no team', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([page({ raceBblId: '16', coachName: 'Hugo E' })]),
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
  });

  it('records an error and skips a team whose race id is not in the map', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '999',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team with no race on the page', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({ teamId: '40g', teamName: '40 grinders', coachName: 'Hugo E' }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team whose coach name is not in the map', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Nobody',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('records an error and continues when a team upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi
      .fn()
      .mockImplementationOnce((_data: unknown, errors: ImportError[]) => {
        errors.push({
          item: {},
          message: 'Failed to import team "40 grinders"',
        });
        return Promise.resolve(false);
      });
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.success).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('40 grinders'))).toBe(
      true,
    );
  });

  it('records an error and continues when a page fails to parse', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const teamParser = new TeamPageParser();
    vi.spyOn(teamParser, 'extractTeam').mockImplementation(() => {
      throw new Error('bad page');
    });
    const service = makeService({
      reader: makeReader([page({ teamId: '40g', teamName: '40 grinders' })]),
      bootstrap,
      upsertTeam,
      parsers: { team: teamParser },
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.imported).toBe(0);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse team page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a page throws a non-Error value', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const teamParser = new TeamPageParser();
    vi.spyOn(teamParser, 'extractTeam').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });
    const service = makeService({
      reader: makeReader([page({ teamId: '40g', teamName: '40 grinders' })]),
      bootstrap,
      upsertTeam,
      parsers: { team: teamParser },
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('bad page'))).toBe(
      true,
    );
  });

  it('records one error and skips teams when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertTeam = vi.fn();
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(upsertTeam).not.toHaveBeenCalled();
  });

  it('returns a map from each team page code to its resolved race id', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { teamRaceIdsByCode } = await service.importTeams(raceIds, coachIds);

    expect(teamRaceIdsByCode.get('40g')).toBe(500);
  });

  it('returns teamsByCode keyed by the team BBL code', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertTeam = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
      bootstrap,
      upsertTeam,
    });

    const { result, teamsByName, teamsByCode } = await service.importTeams(
      raceIds,
      coachIds,
    );

    expect(result.success).toBe(true);
    // same UpsertTeam object is indexed under both name and code
    const code = '40g';
    const name = '40 grinders';
    expect(teamsByCode.get(code)).toEqual(teamsByName.get(name));
  });
});
