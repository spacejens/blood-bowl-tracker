import { Injectable } from '@nestjs/common';

/**
 * TP's paths for one match, exactly as TP's own frontend requests them for a
 * match page: the API path its data is fetched from, and the page path it is
 * shown on under its tournament (sent as the fetch's referer). Shared by
 * tools/download-tp's bulk download and packages/import-tp-live's live match
 * import.
 */

/** A match page path: `<slug>/match/<positive integer id>`, nothing else. */
const MATCH_FRONTEND_PATH = /^([^/]+)\/match\/([1-9]\d*)$/;

@Injectable()
export class TpMatchPathsService {
  apiPath(matchId: number | string): string {
    return `match/${matchId}`;
  }

  frontendPath(slug: string, matchId: number | string): string {
    return `${slug}/match/${matchId}`;
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
