import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { MatchParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpMatchPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { tpMatch } from '../match/tp-match.test-helpers';
import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

describe('TpMatchFetchService', () => {
  let service: TpMatchFetchService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let parser: MockProxy<MatchParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    const connection = mock<TpConnectionProvider>();
    connection.getBackendApiUrl.mockReturnValue('https://tp.example/api/');
    connection.getFrontendUrl.mockReturnValue('https://tp.example/blood-bowl/');
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    parser = mock<MatchParserService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchFetchService,
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        // Pure, dependency-free path formatting, passed real so these tests
        // assert on the actual URLs requested.
        TpMatchPathsService,
        { provide: MatchParserService, useValue: parser },
        TpImportResultsService,
      ],
    }).compile();
    service = moduleRef.get(TpMatchFetchService);
  });

  it('fetches the match from the API with its page as referer and returns it parsed', async () => {
    const body = { raw: true };
    session.fetch.mockResolvedValue(body);
    parser.parse.mockReturnValue(tpMatch());

    const match = await service.fetchMatch({
      matchId: 662796,
      tournamentSlug: 's30',
      errors,
    });

    expect(match).toEqual(tpMatch());
    expect(session.fetch).toHaveBeenCalledWith(
      'https://tp.example/api/match/662796',
      { referer: 'https://tp.example/blood-bowl/s30/match/662796' },
    );
    expect(parser.parse).toHaveBeenCalledWith(body);
    expect(errors).toEqual([]);
  });

  it('fetches through the given session instead of starting one', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockResolvedValue({});
    parser.parse.mockReturnValue(tpMatch());

    await service.fetchMatch({
      matchId: 662796,
      tournamentSlug: 's30',
      errors,
      session: given,
    });

    expect(given.fetch).toHaveBeenCalledTimes(1);
    expect(fetcher.createSession).not.toHaveBeenCalled();
  });

  it('records one error naming the match and returns undefined when the fetch fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    await expect(
      service.fetchMatch({ matchId: 662796, tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { matchId: 662796 },
        message: 'Could not fetch TP match 662796: status 403',
      },
    ]);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error fetch failure', async () => {
    session.fetch.mockRejectedValue('boom');

    await service.fetchMatch({ matchId: 1, tournamentSlug: 's30', errors });

    expect(errors[0].message).toBe('Could not fetch TP match 1: boom');
  });

  it('records one error and returns undefined when the response does not parse', async () => {
    session.fetch.mockResolvedValue({});
    parser.parse.mockImplementation(() => {
      throw new Error('matchId: Required');
    });

    await expect(
      service.fetchMatch({ matchId: 662796, tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { matchId: 662796 },
        message: 'Could not parse TP match 662796: matchId: Required',
      },
    ]);
  });

  it('stringifies a non-Error parse failure', async () => {
    session.fetch.mockResolvedValue({});
    parser.parse.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad shape';
    });

    await service.fetchMatch({ matchId: 1, tournamentSlug: 's30', errors });

    expect(errors[0].message).toBe('Could not parse TP match 1: bad shape');
  });
});
