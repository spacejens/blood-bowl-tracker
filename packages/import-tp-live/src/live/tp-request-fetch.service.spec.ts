import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import {
  TpBlockedError,
  TpFetcherService,
} from '@blood-bowl-tracker/scrape-tp';
import type { TpRequest } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpRequestFetchService } from './tp-request-fetch.service';

const REQUEST: TpRequest = {
  path: 'rosters/163386',
  url: 'https://tp.example/api/rosters/163386',
  referer: 'https://tp.example/blood-bowl/roster/163386',
};

describe('TpRequestFetchService', () => {
  let service: TpRequestFetchService;
  let connection: MockProxy<TpConnectionProvider>;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let errors: ImportError[];

  beforeEach(async () => {
    connection = mock<TpConnectionProvider>();
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRequestFetchService,
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        // Constructor-free and pure, so passed real to assert on the actual
        // recorded error objects.
        ImportResultService,
        UpsertRecorderService,
      ],
    }).compile();
    service = moduleRef.get(TpRequestFetchService);
  });

  function fetchRoster(given?: TpFetchSession) {
    return service.fetch({
      request: REQUEST,
      what: 'TP roster 163386',
      item: { rosterId: 163386 },
      errors,
      session: given,
    });
  }

  it("exposes the connection's base URLs", () => {
    expect(service.baseUrls()).toBe(connection);
  });

  it("fetches the request's URL with its referer through a fresh session", async () => {
    const body = { raw: true };
    session.fetch.mockResolvedValue(body);

    await expect(fetchRoster()).resolves.toEqual({ content: body });
    expect(fetcher.createSession).toHaveBeenCalledTimes(1);
    expect(session.fetch).toHaveBeenCalledWith(REQUEST.url, {
      referer: REQUEST.referer,
    });
    expect(errors).toEqual([]);
  });

  it('fetches through the given session instead of starting one', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockResolvedValue({});

    await fetchRoster(given);

    expect(given.fetch).toHaveBeenCalledTimes(1);
    expect(fetcher.createSession).not.toHaveBeenCalled();
  });

  it('records one error naming what was fetched and yields undefined when the fetch fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    await expect(fetchRoster()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rosterId: 163386 },
        message: 'Could not fetch TP roster 163386: status 403',
      },
    ]);
  });

  it('stringifies a non-Error fetch failure', async () => {
    session.fetch.mockRejectedValue('boom');

    await fetchRoster();

    expect(errors[0].message).toBe('Could not fetch TP roster 163386: boom');
  });

  it('rethrows a TP block instead of recording it', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    session.fetch.mockRejectedValue(blocked);

    await expect(fetchRoster()).rejects.toBe(blocked);
    expect(errors).toEqual([]);
  });
});
