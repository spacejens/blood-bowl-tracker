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
import type { TpBaseUrls, TpRequest } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';

/** Options for {@link TpRequestFetchService.fetch}. */
export interface TpRequestFetchOptions {
  request: TpRequest;
  /**
   * What the request is for, as a recorded failure names it:
   * `Could not fetch <what>: <reason>` (e.g. "TP roster 163386").
   */
  what: string;
  /** Recorded as the ImportError's item on failure. */
  item: unknown;
  /** Where a fetch failure is recorded. */
  errors: ImportError[];
  /** The session to fetch through; a fresh one is started when omitted. */
  session?: TpFetchSession;
}

/** A successful fetch's response, exactly as TP's API returned it. */
export interface TpFetchedContent {
  content: unknown;
}

/**
 * Makes one TP request the way every live fetch does: through the given
 * session (or a fresh one), with the request's referer. A TP block
 * (`TpBlockedError`) is rethrown, so the whole import stops rather than
 * carrying on against a TP that refuses every request; any other failure
 * (network error, TP refusing or rate-limiting the request) is recorded as
 * one ImportError and yields undefined. Also hands the fetch services TP's
 * base URLs to build their requests with.
 */
@Injectable()
export class TpRequestFetchService {
  constructor(
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly importResults: ImportResultService,
    private readonly recorder: UpsertRecorderService,
  ) {}

  /** TP's base URLs, for a path service's request methods. */
  baseUrls(): TpBaseUrls {
    return this.connection;
  }

  async fetch({
    request,
    what,
    item,
    errors,
    session,
  }: TpRequestFetchOptions): Promise<TpFetchedContent | undefined> {
    try {
      const content = await (session ?? this.fetcher.createSession()).fetch(
        request.url,
        { referer: request.referer },
      );
      return { content };
    } catch (error) {
      if (error instanceof TpBlockedError) {
        throw error;
      }
      errors.push(
        this.importResults.error({
          item,
          message: `Could not fetch ${what}: ${this.recorder.messageOf(error)}`,
        }),
      );
      return undefined;
    }
  }
}
