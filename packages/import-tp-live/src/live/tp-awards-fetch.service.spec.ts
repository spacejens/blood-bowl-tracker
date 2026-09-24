import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { AwardsParserService } from '@blood-bowl-tracker/parse-tp';
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
import { TpAwardsFetchService } from './tp-awards-fetch.service';

const API = 'https://tp.example/api/';
const AWARDS_PAGE = 'https://tp.example/blood-bowl/s30/awards';
const AWARDS: TpAward[] = [{ id: 24112, awardType: 1, rosterId: 179769 }];

describe('TpAwardsFetchService', () => {
  let service: TpAwardsFetchService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let parser: MockProxy<AwardsParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    const connection = mock<TpConnectionProvider>();
    connection.getBackendApiUrl.mockReturnValue(API);
    connection.getFrontendUrl.mockReturnValue('https://tp.example/blood-bowl/');
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    session.fetch.mockResolvedValue({ raw: true });
    parser = mock<AwardsParserService>();
    parser.parse.mockReturnValue(AWARDS);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpAwardsFetchService,
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        TpTournamentPathsService,
        { provide: AwardsParserService, useValue: parser },
        TpImportResultsService,
        TpUpsertRunnerService,
      ],
    }).compile();
    service = moduleRef.get(TpAwardsFetchService);
  });

  it('fetches and parses the awards with the awards page as referer', async () => {
    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).resolves.toEqual(AWARDS);
    expect(session.fetch).toHaveBeenCalledWith(`${API}awards/s30/awards`, {
      referer: AWARDS_PAGE,
    });
    expect(parser.parse).toHaveBeenCalledWith({ raw: true });
    expect(errors).toEqual([]);
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockResolvedValue({});

    await service.fetchAwards({
      tournamentSlug: 's30',
      errors,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(given.fetch).toHaveBeenCalledTimes(1);
  });

  it('records one error and yields undefined when the request fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { tournamentSlug: 's30', path: 'awards/s30/awards' },
        message: 'Could not fetch TP awards of tournament s30: status 403',
      },
    ]);
  });

  it('records one error and yields undefined when the response does not parse', async () => {
    parser.parse.mockImplementation(() => {
      throw new Error('Invalid TP awards JSON: (root)');
    });

    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { tournamentSlug: 's30', path: 'awards/s30/awards' },
        message:
          'Could not parse TP awards of tournament s30: Invalid TP awards JSON: (root)',
      },
    ]);
  });
});
