import { Injectable } from '@nestjs/common';

/**
 * TP's paths for one tournament, exactly as TP's own frontend requests them:
 * API paths relative to TP's backend API base URL, and page paths relative to
 * TP's frontend base URL (sent as a fetch's referer). `slug` is the
 * tournament's name as it appears in the frontend path. Shared by
 * tools/download-tp's bulk download and packages/import-tp-live's live match
 * import.
 */
@Injectable()
export class TpTournamentPathsService {
  /** The tournament itself: its categories and their phases. */
  apiPath(slug: string): string {
    return `tournament/${slug}`;
  }

  /** One phase's fixtures, as first loaded: only its current round's matches. */
  phaseApiPath(slug: string, phaseId: number): string {
    return `tournament/${slug}/phases?page=0&pageSize=50&phaseId=${phaseId}&type=COACH`;
  }

  /** One specific round of a phase, as the frontend's round tabs request it. */
  phaseRoundApiPath(
    slug: string,
    phaseId: number,
    roundNumber: number,
  ): string {
    return `${this.phaseApiPath(slug, phaseId)}&round=${roundNumber}`;
  }

  /** One of the tournament's pages (e.g. `scores`, `news`). */
  frontendPath(slug: string, page: string): string {
    return `${slug}/${page}`;
  }
}
