import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TpFetcherService } from './tp-fetcher.service';

const URL_A = 'https://tp.example/api/tournament/a';
const URL_B = 'https://tp.example/api/tournament/b';
const URL_C = 'https://tp.example/api/tournament/c';
const REFERER = 'https://tp.example/blood-bowl/a/news';

type FakeResponseInit = {
  status?: number;
  body?: string;
  setCookies?: string[];
};

/**
 * A stand-in for fetch's Response carrying only what TpFetcherService reads.
 * Built by hand rather than with `new Response(...)` so reading the body
 * involves no stream machinery that fake timers could stall.
 */
function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200;
  const body = init.body ?? '{}';
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(
      (init.setCookies ?? []).map((c): [string, string] => ['set-cookie', c]),
    ),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('TpFetcherService', () => {
  let service: TpFetcherService;
  let fetchMock: Mock<typeof fetch>;

  function sentHeaders(callIndex: number): Record<string, string> {
    return fetchMock.mock.calls[callIndex][1]?.headers as Record<
      string,
      string
    >;
  }

  /** Lets a request finish, advancing fake time past any pacing wait. */
  async function settle<T>(request: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(2000);
    return request;
  }

  beforeEach(async () => {
    fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(fakeResponse());
    vi.stubGlobal('fetch', fetchMock);
    const moduleRef = await Test.createTestingModule({
      providers: [TpFetcherService],
    }).compile();
    service = moduleRef.get(TpFetcherService);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('a request', () => {
    it('returns the response body parsed as JSON', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ body: '{"id":18442}' }));

      await expect(service.createSession().fetch(URL_A)).resolves.toEqual({
        id: 18442,
      });
    });

    it('sends a GET with the full browser-like header set and the given referer', async () => {
      await service.createSession().fetch(URL_A, { referer: REFERER });

      expect(fetchMock).toHaveBeenCalledWith(
        URL_A,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(sentHeaders(0)).toEqual({
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en',
        'content-type': 'application/json',
        priority: 'u=1, i',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-requested-with': 'XMLHttpRequest',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        referer: REFERER,
      });
    });

    it('sends no referer header when none is given', async () => {
      await service.createSession().fetch(URL_A);

      expect(sentHeaders(0)).not.toHaveProperty('referer');
    });

    it('passes a non-GET method and its body through', async () => {
      await service
        .createSession()
        .fetch(URL_A, { method: 'POST', body: '{"q":1}' });

      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        body: '{"q":1}',
      });
    });

    it('throws naming the URL and status on a non-2xx response, without retrying', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse({ status: 403, body: 'Access denied.' }),
      );

      await expect(service.createSession().fetch(URL_A)).rejects.toThrow(
        `TP request to ${URL_A} failed with status 403`,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws when a 2xx body is not valid JSON', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ body: '<html></html>' }));

      await expect(service.createSession().fetch(URL_A)).rejects.toThrow(
        `TP request to ${URL_A} returned a body that is not valid JSON`,
      );
    });

    it('aborts a request that runs longer than 30 s, instead of hanging', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

      await service.createSession().fetch(URL_A);

      expect(timeoutSpy).toHaveBeenCalledWith(30_000);
      expect(fetchMock.mock.calls[0][1]?.signal).toBe(
        timeoutSpy.mock.results[0].value,
      );
    });
  });

  describe('cookies', () => {
    it("sends no cookie header on a session's first request", async () => {
      await service.createSession().fetch(URL_A);

      expect(sentHeaders(0)).not.toHaveProperty('cookie');
    });

    it('sends back cookies set by earlier responses in the same session', async () => {
      const session = service.createSession();
      fetchMock.mockResolvedValueOnce(
        fakeResponse({ setCookies: ['a=1; Path=/; HttpOnly', 'b=2'] }),
      );

      await session.fetch(URL_A);
      await settle(session.fetch(URL_B));

      expect(sentHeaders(1).cookie).toBe('a=1; b=2');
    });

    it('replaces a cookie when a later response sets it again', async () => {
      const session = service.createSession();
      fetchMock
        .mockResolvedValueOnce(fakeResponse({ setCookies: ['a=1'] }))
        .mockResolvedValueOnce(fakeResponse({ setCookies: ['a=2'] }));

      await session.fetch(URL_A);
      await settle(session.fetch(URL_B));
      await settle(session.fetch(URL_C));

      expect(sentHeaders(2).cookie).toBe('a=2');
    });

    it('ignores a Set-Cookie header with no name=value pair', async () => {
      const session = service.createSession();
      fetchMock.mockResolvedValueOnce(
        fakeResponse({ setCookies: ['garbage', '=nameless', 'ok=1'] }),
      );

      await session.fetch(URL_A);
      await settle(session.fetch(URL_B));

      expect(sentHeaders(1).cookie).toBe('ok=1');
    });

    it('keeps cookies private to their own session', async () => {
      fetchMock.mockResolvedValueOnce(fakeResponse({ setCookies: ['a=1'] }));

      await service.createSession().fetch(URL_A);
      await service.createSession().fetch(URL_B);

      expect(sentHeaders(1)).not.toHaveProperty('cookie');
    });
  });

  describe('pacing', () => {
    it("does not delay a session's first request", async () => {
      const request = service.createSession().fetch(URL_A);
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      await request;
    });

    it('waits 0.5 s after the previous request at the shortest', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const session = service.createSession();
      await session.fetch(URL_A);

      const second = session.fetch(URL_B);
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('waits 2 s after the previous request at the longest', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const session = service.createSession();
      await session.fetch(URL_A);

      const second = session.fetch(URL_B);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('counts time already spent since the previous request toward the wait', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // 1250 ms
      const session = service.createSession();
      await session.fetch(URL_A);
      await vi.advanceTimersByTimeAsync(1000);

      const second = session.fetch(URL_B);
      await vi.advanceTimersByTimeAsync(249);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not wait at all once enough time has already passed', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const session = service.createSession();
      await session.fetch(URL_A);
      await vi.advanceTimersByTimeAsync(3000);

      const second = session.fetch(URL_B);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await second;
    });

    it('does not pace one session against another', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      await service.createSession().fetch(URL_A);

      const other = service.createSession().fetch(URL_B);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await other;
    });
  });
});
