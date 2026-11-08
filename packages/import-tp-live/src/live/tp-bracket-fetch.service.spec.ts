import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import type {
  TpPhaseFixtures,
  TpTournament,
} from '@blood-bowl-tracker/parse-tp';
import {
  PhaseFixturesParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import {
  TpBlockedError,
  TpFetcherService,
} from '@blood-bowl-tracker/scrape-tp';
import type { TpBaseUrls } from '@blood-bowl-tracker/tp-paths';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpRequestFetchService } from './tp-request-fetch.service';

const API = 'https://tp.example/api/';
const SCORES = 'https://tp.example/blood-bowl/s30/scores';
const phasePath = (phaseId: number) =>
  `tournament/s30/phases?page=0&pageSize=50&phaseId=${phaseId}&type=COACH`;
const phaseUrl = (phaseId: number) => `${API}${phasePath(phaseId)}`;

const TOURNAMENT: TpTournament = {
  id: 18442,
  name: 'Säsong 30',
  ruleSet: 25,
  phases: [
    { id: 31255, order: 1 },
    { id: 34100, order: 2 },
  ],
  categoryIds: [22308],
};

function fixture(id: number, round: number, playedDate?: Date) {
  return {
    id,
    round,
    homeTeamTpId: id * 10,
    awayTeamTpId: id * 10 + 1,
    playedDate,
    winner: 'home' as const,
  };
}

/**
 * Canned parsed pages, keyed by the URL the raw body came from: the request
 * fetch mock answers every request with its own URL, so the parser mock can
 * look the canned page up by it.
 */
const PAGES = new Map<string, TpPhaseFixtures>([
  [
    phaseUrl(31255),
    {
      currentRound: 2,
      roundNumbers: [1, 2],
      fixtures: [fixture(2, 2, new Date('2026-02-01'))],
    },
  ],
  [
    `${phaseUrl(31255)}&round=1`,
    {
      currentRound: 2,
      roundNumbers: [1, 2],
      fixtures: [fixture(1, 1, new Date('2026-01-10'))],
    },
  ],
  [
    phaseUrl(34100),
    { currentRound: undefined, roundNumbers: [1], fixtures: [fixture(3, 1)] },
  ],
  [
    `${phaseUrl(34100)}&round=1`,
    { currentRound: undefined, roundNumbers: [1], fixtures: [fixture(3, 1)] },
  ],
]);

const EXPECTED_BRACKET = {
  tournament: TOURNAMENT,
  matches: [
    {
      id: 2,
      phaseOrder: 1,
      round: 2,
      homeTeamTpId: 20,
      awayTeamTpId: 21,
      winner: 'home',
    },
    {
      id: 1,
      phaseOrder: 1,
      round: 1,
      homeTeamTpId: 10,
      awayTeamTpId: 11,
      winner: 'home',
    },
    {
      id: 3,
      phaseOrder: 2,
      round: 1,
      homeTeamTpId: 30,
      awayTeamTpId: 31,
      winner: 'home',
    },
  ],
  playedDates: [new Date('2026-02-01'), new Date('2026-01-10')],
};

describe('TpBracketFetchService', () => {
  let service: TpBracketFetchService;
  let requestFetch: MockProxy<TpRequestFetchService>;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let tournamentParser: MockProxy<TournamentParserService>;
  let phaseParser: MockProxy<PhaseFixturesParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    requestFetch = mock<TpRequestFetchService>();
    const baseUrls = mock<TpBaseUrls>();
    baseUrls.getBackendApiUrl.mockReturnValue(API);
    baseUrls.getFrontendBaseUrl.mockReturnValue(
      'https://tp.example/blood-bowl/',
    );
    requestFetch.baseUrls.mockReturnValue(baseUrls);
    requestFetch.fetch.mockImplementation(({ request }) =>
      Promise.resolve({ content: request.url }),
    );
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    tournamentParser = mock<TournamentParserService>();
    tournamentParser.parse.mockReturnValue(TOURNAMENT);
    phaseParser = mock<PhaseFixturesParserService>();
    phaseParser.parse.mockImplementation((body) => {
      const page = PAGES.get(body as string);
      if (page === undefined) {
        throw new Error(`no canned page for ${String(body)}`);
      }
      return page;
    });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpBracketFetchService,
        { provide: TpRequestFetchService, useValue: requestFetch },
        { provide: TpFetcherService, useValue: fetcher },
        TpTournamentPathsService,
        { provide: TournamentParserService, useValue: tournamentParser },
        { provide: PhaseFixturesParserService, useValue: phaseParser },
        ImportResultService,
        UpsertRecorderService,
      ],
    }).compile();
    service = moduleRef.get(TpBracketFetchService);
  });

  it('fetches the tournament and every round of every phase through one visit, with the scores page as referer', async () => {
    const bracket = await service.fetchBracket({
      tournamentSlug: 's30',
      errors,
    });

    const calls = requestFetch.fetch.mock.calls.map(([o]) => o);
    expect(calls.map((o) => [o.request.url, o.request.referer])).toEqual([
      [`${API}tournament/s30`, SCORES],
      [phaseUrl(31255), SCORES],
      [`${phaseUrl(31255)}&round=1`, SCORES],
      [phaseUrl(34100), SCORES],
      [`${phaseUrl(34100)}&round=1`, SCORES],
    ]);
    expect(calls.map((o) => o.what)).toEqual([
      'TP tournament s30',
      'TP phase 31255 of tournament s30',
      'TP round 1 of phase 31255 of tournament s30',
      'TP phase 34100 of tournament s30',
      'TP round 1 of phase 34100 of tournament s30',
    ]);
    for (const o of calls) {
      expect(o.session).toBe(session);
      expect(o.item).toEqual({ tournamentSlug: 's30', path: o.request.path });
      expect(o.errors).toBe(errors);
    }
    expect(fetcher.createSession).toHaveBeenCalledTimes(1);
    expect(bracket).toEqual(EXPECTED_BRACKET);
    expect(errors).toEqual([]);
  });

  it('fetches through the given session instead of starting one', async () => {
    const given = mock<TpFetchSession>();

    await service.fetchBracket({
      tournamentSlug: 's30',
      errors,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    for (const [o] of requestFetch.fetch.mock.calls) {
      expect(o.session).toBe(given);
    }
  });

  it('yields nothing, fetching no further, when a request fails', async () => {
    requestFetch.fetch.mockImplementation(({ request }) =>
      Promise.resolve(
        request.url === phaseUrl(34100) ? undefined : { content: request.url },
      ),
    );

    await expect(
      service.fetchBracket({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(requestFetch.fetch.mock.calls.at(-1)?.[0].request.url).toBe(
      phaseUrl(34100),
    );
  });

  it('records one error and yields nothing when the tournament does not parse', async () => {
    tournamentParser.parse.mockImplementation(() => {
      throw new Error('name: Required');
    });

    await expect(
      service.fetchBracket({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { tournamentSlug: 's30', path: 'tournament/s30' },
        message: 'Could not parse TP tournament s30: name: Required',
      },
    ]);
    expect(phaseParser.parse).not.toHaveBeenCalled();
  });

  it('names the round when one round of a phase does not parse', async () => {
    phaseParser.parse.mockImplementation((body) => {
      if (body === `${phaseUrl(31255)}&round=1`) {
        throw new Error('bad round');
      }
      return PAGES.get(body as string) as TpPhaseFixtures;
    });

    await expect(
      service.fetchBracket({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors[0].message).toBe(
      'Could not parse TP round 1 of phase 31255 of tournament s30: bad round',
    );
  });

  it('lets a TP block stop the import at once', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    requestFetch.fetch.mockRejectedValue(blocked);

    await expect(
      service.fetchBracket({ tournamentSlug: 's30', errors }),
    ).rejects.toBe(blocked);
    expect(requestFetch.fetch).toHaveBeenCalledTimes(1);
  });
});
