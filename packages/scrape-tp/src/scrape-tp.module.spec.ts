import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrapeTpModule } from './scrape-tp.module';
import { TpBlockedError } from './tp-blocked.error';
import { TpFetcherService } from './tp-fetcher.service';

function response(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Compiles the real ScrapeTpModule — the real fetcher and the real gate —
 * per CLAUDE.md's module-composition exception, to verify every session the
 * fetcher creates shares the module's one gate. Only global fetch is stubbed.
 */
describe('ScrapeTpModule', () => {
  let fetcher: TpFetcherService;
  let fetchMock: Mock<typeof fetch>;

  beforeEach(async () => {
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);
    const moduleRef = await Test.createTestingModule({
      imports: [ScrapeTpModule],
    }).compile();
    fetcher = moduleRef.get(TpFetcherService);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("paces a new session's first request against another session's last", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // 2 s
    await fetcher.createSession().fetch('https://tp.example/api/a');

    const other = fetcher.createSession().fetch('https://tp.example/api/b');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await other;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails every session at once, without contacting TP, after one session is blocked', async () => {
    fetchMock.mockResolvedValueOnce(response(403, 'Access denied.'));
    await expect(
      fetcher.createSession().fetch('https://tp.example/api/a'),
    ).rejects.toBeInstanceOf(TpBlockedError);

    await expect(
      fetcher.createSession().fetch('https://tp.example/api/b'),
    ).rejects.toBeInstanceOf(TpBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
