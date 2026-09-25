import { Injectable } from '@nestjs/common';

/**
 * TP's paths for one tournament, exactly as TP's own frontend requests them:
 * API paths relative to TP's backend API base URL, and page paths relative to
 * TP's frontend base URL (sent as a fetch's referer). `slug` is the
 * tournament's name as it appears in the frontend path. Shared by
 * tools/download-tp's bulk download and packages/import-tp-live's live match
 * and competition imports.
 */

/** A tournament page path: a non-empty slug, optionally followed by more. */
const TOURNAMENT_FRONTEND_PATH = /^([^/]+)(?:\/.*)?$/;

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

  /** One category's registered participants, as the players page loads them. */
  inscriptionsApiPath(slug: string, categoryId: number): string {
    return `inscriptions/${slug}/category/${categoryId}/inscriptions?page=0&pageSize=75`;
  }

  /** The tournament's awards, as the awards page loads them. */
  awardsApiPath(slug: string): string {
    return `awards/${slug}/awards`;
  }

  /** One of the tournament's pages (e.g. `scores`, `news`). */
  frontendPath(slug: string, page: string): string {
    return `${slug}/${page}`;
  }

  /**
   * The reverse of `frontendPath`: the tournament slug a page path starts
   * with — the slug alone, or the slug followed by any page. Knows nothing of
   * other page kinds that share this shape (a roster page, the teams page, a
   * match page); a caller wanting those told apart checks them first. Never
   * throws.
   */
  matchFrontendPath(path: string): string | undefined {
    return TOURNAMENT_FRONTEND_PATH.exec(path)?.[1];
  }
}
