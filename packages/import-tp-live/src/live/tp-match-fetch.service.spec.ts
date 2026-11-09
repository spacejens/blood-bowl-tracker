import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import { MatchParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import type { TpBaseUrls } from '@blood-bowl-tracker/tp-paths';
import { TpMatchPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { tpMatch } from '../match/tp-match.test-helpers';
import { TpMatchFetchService } from './tp-match-fetch.service';
import { TpRequestFetchService } from './tp-request-fetch.service';

describe('TpMatchFetchService', () => {
  let service: TpMatchFetchService;
  let requestFetch: MockProxy<TpRequestFetchService>;
  let parser: MockProxy<MatchParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    requestFetch = mock<TpRequestFetchService>();
    const baseUrls = mock<TpBaseUrls>();
    baseUrls.getBackendApiUrl.mockReturnValue('https://tp.example/api/');
    baseUrls.getFrontendBaseUrl.mockReturnValue(
      'https://tp.example/blood-bowl/',
    );
    requestFetch.baseUrls.mockReturnValue(baseUrls);
    parser = mock<MatchParserService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchFetchService,
        { provide: TpRequestFetchService, useValue: requestFetch },
        // Pure, dependency-free path formatting, passed real so these tests
        // assert on the actual URLs requested.
        TpMatchPathsService,
        { provide: MatchParserService, useValue: parser },
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(TpMatchFetchService);
  });

  it('requests the match with its page as referer and returns it parsed', async () => {
    const body = { raw: true };
    requestFetch.fetch.mockResolvedValue({ content: body });
    parser.parse.mockReturnValue(tpMatch());

    const match = await service.fetchMatch({
      matchId: 662796,
      tournamentSlug: 's30',
      errors,
    });

    expect(match).toEqual(tpMatch());
    expect(requestFetch.fetch).toHaveBeenCalledWith({
      request: {
        path: 'match/662796',
        url: 'https://tp.example/api/match/662796',
        referer: 'https://tp.example/blood-bowl/s30/match/662796',
      },
      what: 'TP match 662796',
      item: { matchId: 662796 },
      errors,
      session: undefined,
    });
    expect(parser.parse).toHaveBeenCalledWith(body);
    expect(errors).toEqual([]);
  });

  it('passes the given session on', async () => {
    const given = mock<TpFetchSession>();
    requestFetch.fetch.mockResolvedValue({ content: {} });
    parser.parse.mockReturnValue(tpMatch());

    await service.fetchMatch({
      matchId: 662796,
      tournamentSlug: 's30',
      errors,
      session: given,
    });

    expect(requestFetch.fetch.mock.calls[0][0].session).toBe(given);
  });

  it('yields undefined without parsing when the fetch fails', async () => {
    requestFetch.fetch.mockResolvedValue(undefined);

    await expect(
      service.fetchMatch({ matchId: 662796, tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('records one error and returns undefined when the response does not parse', async () => {
    requestFetch.fetch.mockResolvedValue({ content: {} });
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
    requestFetch.fetch.mockResolvedValue({ content: {} });
    parser.parse.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad shape';
    });

    await service.fetchMatch({ matchId: 1, tournamentSlug: 's30', errors });

    expect(errors[0].message).toBe('Could not parse TP match 1: bad shape');
  });

  it('lets a TP block stop the import', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    requestFetch.fetch.mockRejectedValue(blocked);

    await expect(
      service.fetchMatch({ matchId: 662796, tournamentSlug: 's30', errors }),
    ).rejects.toBe(blocked);
    expect(parser.parse).not.toHaveBeenCalled();
  });
});
