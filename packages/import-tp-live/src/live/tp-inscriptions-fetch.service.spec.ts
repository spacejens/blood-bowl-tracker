import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
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
import { TpInscriptionsFetchService } from './tp-inscriptions-fetch.service';

const API = 'https://tp.example/api/';
const PLAYERS = 'https://tp.example/blood-bowl/s30/players';
const inscriptionsPath = (categoryId: number) =>
  `inscriptions/s30/category/${categoryId}/inscriptions?page=0&pageSize=75`;

/**
 * Canned parsed roster ids, keyed by the URL the raw body came from: the
 * session mock answers every request with its own URL.
 */
const ROSTER_IDS = new Map<string, number[]>([
  [`${API}${inscriptionsPath(22308)}`, [163386, 179769]],
  [`${API}${inscriptionsPath(22309)}`, [179769, 180001]],
]);

describe('TpInscriptionsFetchService', () => {
  let service: TpInscriptionsFetchService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let parser: MockProxy<InscriptionsParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    const connection = mock<TpConnectionProvider>();
    connection.getBackendApiUrl.mockReturnValue(API);
    connection.getFrontendUrl.mockReturnValue('https://tp.example/blood-bowl/');
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    session.fetch.mockImplementation((url) => Promise.resolve(url));
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
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        TpTournamentPathsService,
        { provide: InscriptionsParserService, useValue: parser },
        TpImportResultsService,
        TpUpsertRunnerService,
      ],
    }).compile();
    service = moduleRef.get(TpInscriptionsFetchService);
  });

  it("fetches every category's inscriptions with the players page as referer, deduping roster ids", async () => {
    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [22308, 22309],
        errors,
      }),
    ).resolves.toEqual([163386, 179769, 180001]);
    expect(session.fetch.mock.calls).toEqual([
      [`${API}${inscriptionsPath(22308)}`, { referer: PLAYERS }],
      [`${API}${inscriptionsPath(22309)}`, { referer: PLAYERS }],
    ]);
    expect(errors).toEqual([]);
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockImplementation((url) => Promise.resolve(url));

    await service.fetchParticipantRosterIds({
      tournamentSlug: 's30',
      categoryIds: [22308],
      errors,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(given.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns no roster ids, fetching nothing, for a tournament with no categories', async () => {
    await expect(
      service.fetchParticipantRosterIds({
        tournamentSlug: 's30',
        categoryIds: [],
        errors,
      }),
    ).resolves.toEqual([]);
    expect(session.fetch).not.toHaveBeenCalled();
  });

  it('records one error and yields undefined when a request fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 429'));

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
          'Could not fetch TP inscriptions of category 22308 of tournament s30: status 429',
      },
    ]);
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
});
