import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type {
  TpPhaseFixtures,
  TpTournament,
} from '@blood-bowl-tracker/parse-tp';
import {
  PhaseFixturesParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';

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
 * Canned parsed pages, keyed by the URL the raw body came from: the session
 * mock answers every request with its own URL, so the parser mock can look
 * the canned page up by it.
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

describe('TpBracketFetchService', () => {
  let service: TpBracketFetchService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let tournamentParser: MockProxy<TournamentParserService>;
  let phaseParser: MockProxy<PhaseFixturesParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    const connection = mock<TpConnectionProvider>();
    connection.getBackendApiUrl.mockReturnValue(API);
    connection.getFrontendUrl.mockReturnValue('https://tp.example/blood-bowl/');
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    session.fetch.mockImplementation((url) => Promise.resolve(url));
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
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        TpTournamentPathsService,
        { provide: TournamentParserService, useValue: tournamentParser },
        { provide: PhaseFixturesParserService, useValue: phaseParser },
        TpImportResultsService,
        TpUpsertRunnerService,
      ],
    }).compile();
    service = moduleRef.get(TpBracketFetchService);
  });

  it('fetches the tournament and every round of every phase, with the scores page as referer', async () => {
    const bracket = await service.fetchBracket({
      tournamentSlug: 's30',
      errors,
    });

    expect(session.fetch.mock.calls).toEqual([
      [`${API}tournament/s30`, { referer: SCORES }],
      [phaseUrl(31255), { referer: SCORES }],
      [`${phaseUrl(31255)}&round=1`, { referer: SCORES }],
      [phaseUrl(34100), { referer: SCORES }],
      [`${phaseUrl(34100)}&round=1`, { referer: SCORES }],
    ]);
    expect(bracket).toEqual({
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
    });
    expect(errors).toEqual([]);
  });

  it('fetches through the given session instead of starting one', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockImplementation((url) => Promise.resolve(url));

    await service.fetchBracket({
      tournamentSlug: 's30',
      errors,
      session: given,
    });

    expect(given.fetch).toHaveBeenCalled();
    expect(fetcher.createSession).not.toHaveBeenCalled();
  });

  it('records one error and yields nothing when a request fails', async () => {
    session.fetch.mockImplementation((url) =>
      url === phaseUrl(34100)
        ? Promise.reject(new Error('status 429'))
        : Promise.resolve(url),
    );

    await expect(
      service.fetchBracket({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { tournamentSlug: 's30', path: phasePath(34100) },
        message: 'Could not fetch TP phase 34100 of tournament s30: status 429',
      },
    ]);
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
});
