import { Injectable } from '@nestjs/common';

/**
 * TP's paths for one match, exactly as TP's own frontend requests them for a
 * match page: the API path its data is fetched from, and the page path it is
 * shown on under its tournament (sent as the fetch's referer). Shared by
 * tools/download-tp's bulk download and packages/import-tp-live's live match
 * import.
 */
@Injectable()
export class TpMatchPathsService {
  apiPath(matchId: number | string): string {
    return `match/${matchId}`;
  }

  frontendPath(slug: string, matchId: number | string): string {
    return `${slug}/match/${matchId}`;
  }
}
