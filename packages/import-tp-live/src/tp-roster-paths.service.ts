import { Injectable } from '@nestjs/common';

/**
 * TP's paths for one team roster, exactly as TP's own frontend requests them
 * for a roster page: the API path its data is fetched from, relative to TP's
 * backend API base URL, and the frontend page path it is shown on, relative
 * to TP's frontend base URL (sent as the fetch's referer). The one place
 * these paths live: tools/download-tp's bulk download and this package's
 * live import both build roster requests from it.
 */
@Injectable()
export class TpRosterPathsService {
  apiPath(rosterId: number | string): string {
    return `rosters/${rosterId}`;
  }

  frontendPath(rosterId: number | string): string {
    return `roster/${rosterId}`;
  }
}
