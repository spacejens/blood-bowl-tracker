import { Injectable } from '@nestjs/common';

/** A roster page path: `roster/<positive integer id>`, nothing else. */
const ROSTER_FRONTEND_PATH = /^roster\/([1-9]\d*)$/;

/**
 * TP's paths for one team roster, exactly as TP's own frontend requests them
 * for a roster page: the API path its data is fetched from, relative to TP's
 * backend API base URL, and the frontend page path it is shown on, relative
 * to TP's frontend base URL (sent as the fetch's referer). The one place
 * these paths live: tools/download-tp's bulk download and
 * packages/import-tp-live's live fetch both build roster requests from it.
 */
@Injectable()
export class TpRosterPathsService {
  apiPath(rosterId: number | string): string {
    return `rosters/${rosterId}`;
  }

  frontendPath(rosterId: number | string): string {
    return `roster/${rosterId}`;
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
