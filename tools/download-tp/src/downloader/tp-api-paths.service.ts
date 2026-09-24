import { Injectable } from '@nestjs/common';

/**
 * Every TP API path download-tp requests, relative to
 * `connection.backendApiUrl`. Each is exactly the path — query string
 * included — TP's own frontend requests for the matching page, as captured
 * from a real browser session, so the files written under these names are the
 * same ones a browser-based capture recorded. If TP's frontend changes which
 * endpoints a page calls, this is the one place to update — except roster, tournament, phase and match paths,
 * which live in packages/tp-paths, shared with the live import.
 *
 * `slug` is a tournament's name as it appears in the frontend path.
 */
@Injectable()
export class TpApiPathsService {
  news(slug: string): string {
    return `tournament/${slug}/news`;
  }

  /** A phase's standings. "clasifications" is TP's own spelling. */
  classifications(slug: string, phaseId: number): string {
    return `tournament/${slug}/clasifications?page=0&pageSize=75&phaseId=${phaseId}&type=COACH`;
  }

  /** The honours page's default Team view. */
  teamStats(slug: string): string {
    return `tournament/${slug}/team-stats`;
  }

  /** The honours page's Player toggle. */
  lineupStats(slug: string): string {
    return `tournament/${slug}/lineup-stats`;
  }

  /** The honours page's Coach toggle. */
  coachStats(slug: string): string {
    return `tournament/${slug}/coach-stats`;
  }

  statistics(slug: string): string {
    return `tournament/${slug}/statistics`;
  }

  /** One category's participants, keyed by category id in the response. */
  inscriptions(slug: string, categoryId: number): string {
    return `inscriptions/${slug}/category/${categoryId}/inscriptions?page=0&pageSize=75`;
  }

  awards(slug: string): string {
    return `awards/${slug}/awards`;
  }

  /** TP's official team list for one rules set, by TP's numeric id for it. */
  officialTeams(ruleSetId: number): string {
    return `rosters/masters?ruleSet=${ruleSetId}`;
  }
}
