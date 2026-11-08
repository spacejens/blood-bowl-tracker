import { Injectable } from '@nestjs/common';

import type { TpBaseUrls, TpRequest } from './tp-request';

/** A match page path: `<slug>/match/<positive integer id>`, nothing else. */
const MATCH_FRONTEND_PATH = /^([^/]+)\/match\/([1-9]\d*)$/;

/**
 * TP's request for one match, exactly as TP's own frontend sends it from a
 * match page: a `TpRequest` holding the API path, the full API URL and the
 * full match page URL under its tournament (sent as the fetch's referer),
 * plus the reverse matcher for match page paths. Shared by
 * tools/download-tp's bulk download and packages/import-tp-live's live match
 * import.
 */
@Injectable()
export class TpMatchPathsService {
  private apiPath(matchId: number | string): string {
    return `match/${matchId}`;
  }

  frontendPath(slug: string, matchId: number | string): string {
    return `${slug}/match/${matchId}`;
  }

  /** A match's API request, sent from its page under its tournament. */
  request(
    baseUrls: TpBaseUrls,
    slug: string,
    matchId: number | string,
  ): TpRequest {
    const path = this.apiPath(matchId);
    return {
      path,
      url: baseUrls.getBackendApiUrl() + path,
      referer: baseUrls.getFrontendBaseUrl() + this.frontendPath(slug, matchId),
    };
  }

  /**
   * The reverse of `frontendPath`: the tournament slug and match id a match
   * page path shows, or undefined when the path is not a match page
   * (including a non-numeric, non-positive or out-of-range id). Never throws.
   */
  matchFrontendPath(
    path: string,
  ): { tournamentSlug: string; matchId: number } | undefined {
    const match = MATCH_FRONTEND_PATH.exec(path);
    if (!match) return undefined;
    const matchId = Number(match[2]);
    if (!Number.isSafeInteger(matchId)) return undefined;
    return { tournamentSlug: match[1], matchId };
  }
}
