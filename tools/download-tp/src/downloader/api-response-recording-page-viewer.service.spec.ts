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
    await service.viewPage('https://tp.example/blood-bowl/x');

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

    await service.viewPage('https://tp.example/blood-bowl/x');

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

    await service.viewPage('https://tp.example/blood-bowl/x');

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

    const result = await service.viewPage('https://tp.example/blood-bowl/x');

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

    const result = await service.viewPage('https://tp.example/blood-bowl/x');

    expect(result.apiResponses.size).toBe(0);
  });

  it('collects console errors and warnings and ignores other console output', async () => {
    page.goto.mockImplementation(() => {
      handlers.console(fakeConsoleMessage('error', 'boom') as never);
      handlers.console(fakeConsoleMessage('warn', 'careful') as never);
      handlers.console(fakeConsoleMessage('log', 'chatter') as never);
    });

    const result = await service.viewPage('https://tp.example/blood-bowl/x');

    expect(result.consoleErrors).toEqual(['boom']);
    expect(result.consoleWarnings).toEqual(['careful']);
  });

  it('collects page errors', async () => {
    page.goto.mockImplementation(() => {
      handlers.pageerror(new Error('page exploded') as never);
    });

    const result = await service.viewPage('https://tp.example/blood-bowl/x');

    expect(result.pageErrors).toEqual(['page exploded']);
  });

  it('collects non-Error page errors by wrapping them in an Error', async () => {
    page.goto.mockImplementation(() => {
      handlers.pageerror('boom' as never);
    });

    const result = await service.viewPage('https://tp.example/blood-bowl/x');

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

    await service.viewPage('https://tp.example/blood-bowl/x', [
      { selector: '.mat-button-toggle-button', textContent: 'Team' },
    ]);

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
      service.viewPage('https://tp.example/blood-bowl/x', [
        { selector: '.sel', textContent: 'Nope' },
      ]),
    ).rejects.toThrow('No element found for selector ".sel" with text "Nope"');
  });
});
