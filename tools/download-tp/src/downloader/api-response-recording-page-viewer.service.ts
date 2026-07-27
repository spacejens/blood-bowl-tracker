import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer';

export type ApiResponseRecordingPageViewerClickableElement = {
  selector: string;
  textContent: string;
};

/**
 * Resolves additional absolute API URLs to fetch from inside the already-open
 * page, given the responses recorded so far. TP paginates some endpoints and
 * only requests the first page/round on load; fetching the rest from inside
 * the page reuses its own session and headers.
 */
export type ApiResponseFollowUpRequestResolver = (
  apiResponses: Map<string, unknown>,
) => string[];

export type ApiResponseRecordingPageViewerOptions = {
  pageUrl: string;
  clickableElements?: ApiResponseRecordingPageViewerClickableElement[];
  followUpRequests?: ApiResponseFollowUpRequestResolver;
};

export type ApiResponseRecordingPageViewerResult = {
  apiResponses: Map<string, unknown>;
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
};

@Injectable()
export class ApiResponseRecordingPageViewerService {
  constructor(private readonly configService: ConfigService) {}

  async viewPage(
    options: ApiResponseRecordingPageViewerOptions,
  ): Promise<ApiResponseRecordingPageViewerResult> {
    const { pageUrl, clickableElements = [], followUpRequests } = options;
    const responses = new Map<string, unknown>();
    const pendingResponses: Promise<void>[] = [];
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const pageErrors: string[] = [];

    // Pretend to be a normal browser
    const browser = await puppeteer.launch({
      headless: this.configService.get<string>('HIDE_BROWSER_UI') === 'true',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Set up response recording
    const apiUrl = this.configService.getOrThrow<string>('TP_BACKEND_API_URL');
    page.on('requestfinished', (request) => {
      const requestUrl = request.url();
      if (!requestUrl.startsWith(apiUrl)) {
        return;
      }
      const response = request.response();
      if (!response) {
        return;
      }
      pendingResponses.push(
        response.json().then((body: unknown) => {
          responses.set(requestUrl.substring(apiUrl.length), body);
        }),
      );
    });

    // Set up console recording
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        consoleErrors.push(text);
      } else if (type === 'warn') {
        consoleWarnings.push(text);
      }
    });

    // Set up page error recording
    page.on('pageerror', (error) => {
      const errorObject =
        error instanceof Error ? error : new Error(String(error));
      console.error(errorObject.stack);
      pageErrors.push(errorObject.message);
    });

    // Visit the page
    await page.goto(pageUrl, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 1080, height: 1024 });
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 });

    // Click any clickable elements specified
    for (const clickableElement of clickableElements) {
      console.log(`Clicking element: ${JSON.stringify(clickableElement)}`);
      await page.evaluate(
        (selector: string, expectedText: string) => {
          const hasNodeWithTextContent = (
            elem: Element,
            textContent: string,
          ): boolean => {
            if (elem.textContent === textContent) return true;
            for (let i = 0; i < elem.childElementCount; i++) {
              const child = elem.children.item(i);
              if (child && hasNodeWithTextContent(child, textContent))
                return true;
            }
            return false;
          };
          const candidates = document.querySelectorAll(selector);
          for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (hasNodeWithTextContent(el, expectedText)) {
              (el as HTMLElement).click();
              return;
            }
          }
          throw new Error(
            `No element found for selector "${selector}" with text "${expectedText}"`,
          );
        },
        clickableElement.selector,
        clickableElement.textContent,
      );
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 });
    }

    // Fetch any follow-up API URLs from inside the open page, so they reuse
    // the page's own session and headers. The caller decides which URLs to
    // ask for, based on what has been recorded so far.
    if (followUpRequests) {
      await Promise.all(pendingResponses);
      for (const followUpUrl of followUpRequests(responses)) {
        console.log(`Fetching follow-up URL ${followUpUrl}`);
        const body: unknown = await page.evaluate(
          (url: string) =>
            fetch(url).then((r) => {
              if (!r.ok) {
                throw new Error(
                  `Follow-up request to ${url} failed with status ${r.status}`,
                );
              }
              return r.json() as Promise<unknown>;
            }),
          followUpUrl,
        );
        responses.set(followUpUrl.substring(apiUrl.length), body);
      }
    }

    // Make sure every recorded response body has been read
    await Promise.all(pendingResponses);

    // Clean up the browser session
    await browser.close();

    // Return the collected responses
    return {
      apiResponses: responses,
      consoleErrors: consoleErrors,
      consoleWarnings: consoleWarnings,
      pageErrors: pageErrors,
    };
  }
}
