import { Injectable } from '@nestjs/common';

import type { TpBaseUrls, TpRequest } from './tp-request';

/** A roster page path: `roster/<positive integer id>`, nothing else. */
const ROSTER_FRONTEND_PATH = /^roster\/([1-9]\d*)$/;

/**
 * TP's request for one team roster, exactly as TP's own frontend sends it
 * from a roster page: a `TpRequest` holding the API path, the full API URL
 * and the full roster page URL (sent as the fetch's referer), plus the
 * reverse matcher for roster page paths. The one place these paths live:
 * tools/download-tp's bulk download and packages/import-tp-live's live fetch
 * both build roster requests from it.
 */
@Injectable()
export class TpRosterPathsService {
  private apiPath(rosterId: number | string): string {
    return `rosters/${rosterId}`;
  }

  frontendPath(rosterId: number | string): string {
    return `roster/${rosterId}`;
  }

  /** A roster's API request, sent from its roster page. */
  request(baseUrls: TpBaseUrls, rosterId: number | string): TpRequest {
    const path = this.apiPath(rosterId);
    return {
      path,
      url: baseUrls.getBackendApiUrl() + path,
      referer: baseUrls.getFrontendBaseUrl() + this.frontendPath(rosterId),
    };
  }

  /**
   * The reverse of `frontendPath`: the roster id a roster page path shows, or
   * undefined when the path is not a roster page (including a non-numeric,
   * non-positive or out-of-range id). Never throws.
   */
  matchFrontendPath(path: string): number | undefined {
    const match = ROSTER_FRONTEND_PATH.exec(path);
    if (!match) return undefined;
    const rosterId = Number(match[1]);
    return Number.isSafeInteger(rosterId) ? rosterId : undefined;
  }
}
