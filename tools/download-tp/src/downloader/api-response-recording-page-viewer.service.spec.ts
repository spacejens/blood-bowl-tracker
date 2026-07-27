import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ApiResponseRecordingPageViewerService } from './api-response-recording-page-viewer.service';

vi.mock('puppeteer', () => ({
  default: { launch: vi.fn() },
}));

type Handlers = Record<string, (arg: never) => void>;

type FakeElement = {
  textContent: string;
  childElementCount: number;
  children: { item: (index: number) => FakeElement | null };
  click: ReturnType<typeof vi.fn>;
};

function fakeElement(
  textContent: string,
  children: FakeElement[] = [],
): FakeElement {
  return {
    textContent,
    childElementCount: children.length,
    children: { item: (index: number) => children[index] ?? null },
    click: vi.fn(),
  };
}

function fakeRequest(url: string, body?: unknown) {
  return {
    url: () => url,
    response: () =>
      body === undefined ? null : { json: () => Promise.resolve(body) },
  };
}

function fakeConsoleMessage(type: string, text: string) {
  return { type: () => type, text: () => text };
}

describe('ApiResponseRecordingPageViewerService', () => {
  let service: ApiResponseRecordingPageViewerService;
  let configService: MockProxy<ConfigService>;
  let handlers: Handlers;
  let page: {
    on: ReturnType<typeof vi.fn>;
    setUserAgent: ReturnType<typeof vi.fn>;
    evaluateOnNewDocument: ReturnType<typeof vi.fn>;
    goto: ReturnType<typeof vi.fn>;
    setViewport: ReturnType<typeof vi.fn>;
    waitForNetworkIdle: ReturnType<typeof vi.fn>;
    evaluate: ReturnType<typeof vi.fn>;
  };
  let browser: {
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handlers = {};
    page = {
      on: vi.fn((event: string, handler: (arg: never) => void) => {
        handlers[event] = handler;
      }),
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      setViewport: vi.fn().mockResolvedValue(undefined),
      waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };
    browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(puppeteer.launch).mockResolvedValue(
      browser as unknown as Browser,
    );

    configService = mock<ConfigService>();
    configService.get.mockImplementation((key: string) =>
      key === 'HIDE_BROWSER_UI' ? 'true' : undefined,
    );
    configService.getOrThrow.mockImplementation((key: string) =>
      key === 'TP_BACKEND_API_URL' ? 'https://tp.example/api/' : '',
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiResponseRecordingPageViewerService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(ApiResponseRecordingPageViewerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('launches headless when HIDE_BROWSER_UI is "true" and closes the browser', async () => {
    await service.viewPage({ pageUrl: 'https://tp.example/blood-bowl/x' });

    expect(puppeteer.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true }),
    );
    expect(page.goto).toHaveBeenCalledWith('https://tp.example/blood-bowl/x', {
      waitUntil: 'networkidle0',
    });
    expect(browser.close).toHaveBeenCalled();
  });

  it('launches with visible UI when HIDE_BROWSER_UI is not "true"', async () => {
    configService.get.mockReturnValue('false');

    await service.viewPage({ pageUrl: 'https://tp.example/blood-bowl/x' });

    expect(puppeteer.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: false }),
    );
  });

  it('hides the webdriver flag from the page', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    page.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
      fn();
    });

    await service.viewPage({ pageUrl: 'https://tp.example/blood-bowl/x' });

    expect(globalThis.navigator.webdriver).toBeUndefined();
    expect('webdriver' in globalThis.navigator).toBe(true);
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('records API responses keyed by the URL suffix after the API base', async () => {
    page.goto.mockImplementation(() => {
      handlers.requestfinished(
        fakeRequest('https://tp.example/api/tournaments/x', {
          id: 'x',
        }) as never,
      );
      handlers.requestfinished(
        fakeRequest('https://cdn.example/logo.png', {
          ignored: true,
        }) as never,
      );
    });

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
    });

    expect([...result.apiResponses.entries()]).toEqual([
      ['tournaments/x', { id: 'x' }],
    ]);
  });

  it('ignores a matching request that has no response', async () => {
    page.goto.mockImplementation(() => {
      handlers.requestfinished(
        fakeRequest('https://tp.example/api/tournaments/x') as never,
      );
    });

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
    });

    expect(result.apiResponses.size).toBe(0);
  });

  it('collects console errors and warnings and ignores other console output', async () => {
    page.goto.mockImplementation(() => {
      handlers.console(fakeConsoleMessage('error', 'boom') as never);
      handlers.console(fakeConsoleMessage('warn', 'careful') as never);
      handlers.console(fakeConsoleMessage('log', 'chatter') as never);
    });

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
    });

    expect(result.consoleErrors).toEqual(['boom']);
    expect(result.consoleWarnings).toEqual(['careful']);
  });

  it('collects page errors', async () => {
    page.goto.mockImplementation(() => {
      handlers.pageerror(new Error('page exploded') as never);
    });

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
    });

    expect(result.pageErrors).toEqual(['page exploded']);
  });

  it('collects non-Error page errors by wrapping them in an Error', async () => {
    page.goto.mockImplementation(() => {
      handlers.pageerror('boom' as never);
    });

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
    });

    expect(result.pageErrors).toEqual(['boom']);
  });

  it('clicks the first element whose subtree matches the expected text', async () => {
    const wrong = fakeElement('Other');
    const nested = fakeElement('Team');
    const right = fakeElement('wrapper', [nested]);
    Object.defineProperty(globalThis, 'document', {
      value: { querySelectorAll: () => [wrong, right] },
      configurable: true,
      writable: true,
    });
    page.evaluate.mockImplementation(
      (fn: (...args: string[]) => unknown, ...args: string[]) => fn(...args),
    );

    await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
      clickableElements: [
        { selector: '.mat-button-toggle-button', textContent: 'Team' },
      ],
    });

    expect(right.click).toHaveBeenCalled();
    expect(wrong.click).not.toHaveBeenCalled();
    // once after goto, once after the click
    expect(page.waitForNetworkIdle).toHaveBeenCalledTimes(2);
  });

  it('throws when no element matches the expected text', async () => {
    Object.defineProperty(globalThis, 'document', {
      value: { querySelectorAll: () => [fakeElement('Other')] },
      configurable: true,
      writable: true,
    });
    page.evaluate.mockImplementation(
      (fn: (...args: string[]) => unknown, ...args: string[]) => fn(...args),
    );

    await expect(
      service.viewPage({
        pageUrl: 'https://tp.example/blood-bowl/x',
        clickableElements: [{ selector: '.sel', textContent: 'Nope' }],
      }),
    ).rejects.toThrow('No element found for selector ".sel" with text "Nope"');
  });

  it('fetches follow-up URLs from inside the page and records their responses', async () => {
    page.goto.mockImplementation(() => {
      handlers.requestfinished(
        fakeRequest('https://tp.example/api/phases?phaseId=1', {
          currentRound: 1,
        }) as never,
      );
    });
    // The mocked evaluate signature is untyped (ReturnType<typeof vi.fn>), so
    // its inferred parameter type is a void-returning function; the real
    // page.evaluate is async, and this mock simulates that faithfully.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    page.evaluate.mockImplementation((_fn: unknown, url: string) =>
      Promise.resolve({ round: url.endsWith('round=2') ? 2 : 3 }),
    );

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x/scores',
      followUpRequests: (apiResponses) => {
        expect([...apiResponses.keys()]).toEqual(['phases?phaseId=1']);
        return [
          'https://tp.example/api/phases?phaseId=1&round=2',
          'https://tp.example/api/phases?phaseId=1&round=3',
        ];
      },
    });

    expect([...result.apiResponses.entries()]).toEqual([
      ['phases?phaseId=1', { currentRound: 1 }],
      ['phases?phaseId=1&round=2', { round: 2 }],
      ['phases?phaseId=1&round=3', { round: 3 }],
    ]);
  });

  it('really calls fetch inside the page for each follow-up URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fetched: true }),
    });
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
    page.evaluate.mockImplementation(
      (fn: (url: string) => unknown, url: string) => fn(url),
    );

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x/scores',
      followUpRequests: () => ['https://tp.example/api/phases?round=2'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tp.example/api/phases?round=2',
    );
    expect(result.apiResponses.get('phases?round=2')).toEqual({
      fetched: true,
    });
  });

  it('throws when a follow-up fetch response has a non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'not found' }),
    });
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
    page.evaluate.mockImplementation(
      (fn: (url: string) => unknown, url: string) => fn(url),
    );

    await expect(
      service.viewPage({
        pageUrl: 'https://tp.example/blood-bowl/x/scores',
        followUpRequests: () => ['https://tp.example/api/phases?round=2'],
      }),
    ).rejects.toThrow(
      'Follow-up request to https://tp.example/api/phases?round=2 failed with status 404',
    );
  });

  it('evaluates no follow-up fetch when the resolver returns no URLs', async () => {
    await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x/scores',
      followUpRequests: () => [],
    });

    expect(page.evaluate).not.toHaveBeenCalled();
  });
});
