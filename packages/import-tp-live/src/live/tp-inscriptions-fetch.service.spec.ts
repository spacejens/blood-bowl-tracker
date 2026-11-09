import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
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

import { TpInscriptionsFetchService } from './tp-inscriptions-fetch.service';
import { TpRequestFetchService } from './tp-request-fetch.service';

const API = 'https://tp.example/api/';
const PLAYERS = 'https://tp.example/blood-bowl/s30/players';
const inscriptionsPath = (categoryId: number) =>
  `inscriptions/s30/category/${categoryId}/inscriptions?page=0&pageSize=75`;

/**
 * Canned parsed roster ids, keyed by the URL the raw body came from: the
 * request fetch mock answers every request with its own URL.
 */
const ROSTER_IDS = new Map<string, number[]>([
  [`${API}${inscriptionsPath(22308)}`, [163386, 179769]],
  [`${API}${inscriptionsPath(22309)}`, [179769, 180001]],
]);

describe('TpInscriptionsFetchService', () => {
  let service: TpInscriptionsFetchService;
  let requestFetch: MockProxy<TpRequestFetchService>;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let parser: MockProxy<InscriptionsParserService>;
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
    parser = mock<InscriptionsParserService>();
    parser.parseRosterIds.mockImplementation((body) => {
      const ids = ROSTER_IDS.get(body as string);
      if (ids === undefined) {
        throw new Error(`no canned roster ids for ${String(body)}`);
      }
      return ids;
    });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpInscriptionsFetchService,
        { provide: TpRequestFetchService, useValue: requestFetch },
        { provide: TpFetcherService, useValue: fetcher },
        TpTournamentPathsService,
        { provide: InscriptionsParserService, useValue: parser },
        ImportResultService,
        UpsertRecorderService,
      ],
    }).compile();
    service = moduleRef.get(TpInscriptionsFetchService);
  });

  it("requests every category's inscriptions with the players page as referer through one visit, deduping roster ids", async () => {
    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [22308, 22309],
        errors,
      }),
    ).resolves.toEqual([163386, 179769, 180001]);
    expect(requestFetch.fetch.mock.calls.map(([o]) => o)).toEqual([
      {
        request: {
          path: inscriptionsPath(22308),
          url: `${API}${inscriptionsPath(22308)}`,
          referer: PLAYERS,
        },
        what: 'TP inscriptions of category 22308 of tournament s30',
        item: { tournamentSlug: 's30', path: inscriptionsPath(22308) },
        errors,
        session,
      },
      {
        request: {
          path: inscriptionsPath(22309),
          url: `${API}${inscriptionsPath(22309)}`,
          referer: PLAYERS,
        },
        what: 'TP inscriptions of category 22309 of tournament s30',
        item: { tournamentSlug: 's30', path: inscriptionsPath(22309) },
        errors,
        session,
      },
    ]);
    expect(fetcher.createSession).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();

    await service.fetchParticipantRosterIds({
      tournamentSlug: 's30',
      categoryIds: [22308],
      errors,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(requestFetch.fetch.mock.calls[0][0].session).toBe(given);
  });

  it('returns no roster ids, fetching nothing, for a tournament with no categories', async () => {
    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [],
        errors,
      }),
    ).resolves.toEqual([]);
    expect(requestFetch.fetch).not.toHaveBeenCalled();
  });

  it('yields undefined, fetching no further category, when a request fails', async () => {
    requestFetch.fetch.mockResolvedValue(undefined);

    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [22308, 22309],
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(requestFetch.fetch).toHaveBeenCalledTimes(1);
    expect(parser.parseRosterIds).not.toHaveBeenCalled();
  });

  it('records one error and yields undefined when a response does not parse', async () => {
    parser.parseRosterIds.mockImplementation(() => {
      throw new Error('Invalid TP inscriptions JSON: 22308.0.roster.id');
    });

    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [22308],
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { tournamentSlug: 's30', path: inscriptionsPath(22308) },
        message:
          'Could not parse TP inscriptions of category 22308 of tournament s30: Invalid TP inscriptions JSON: 22308.0.roster.id',
      },
    ]);
  });

  it('lets a TP block stop the import at once, fetching no further category', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    requestFetch.fetch.mockRejectedValue(blocked);

    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [22308, 22309],
        errors,
      }),
    ).rejects.toBe(blocked);
    expect(requestFetch.fetch).toHaveBeenCalledTimes(1);
  });
});
