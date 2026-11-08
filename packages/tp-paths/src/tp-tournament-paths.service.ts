import { Injectable } from '@nestjs/common';

import type { TpBaseUrls, TpRequest } from './tp-request';

/** A tournament page path: a non-empty slug, optionally followed by more. */
const TOURNAMENT_FRONTEND_PATH = /^([^/]+)(?:\/.*)?$/;

/** The tournament page listing every phase's fixtures and results. */
const SCORES_PAGE = 'scores';

/** One round of one phase, as the frontend's round tabs request it. */
export type TpPhaseRound = { phaseId: number; roundNumber: number };

/**
 * TP's requests for one tournament, exactly as TP's own frontend sends them:
 * each request method returns a `TpRequest` holding the API path, the full
 * API URL and the full URL of the page TP's frontend sends it from, plus the
 * reverse matchers for tournament page paths. `slug` is the tournament's
 * name as it appears in the frontend path. Shared by
 * tools/download-tp's bulk download and packages/import-tp-live's live match
 * and competition imports; the news, classifications, honours and statistics
 * paths are requested by the bulk download only.
 */
@Injectable()
export class TpTournamentPathsService {
  /**
   * The reverse of a tournament page path, such as a tournament request's
   * referer page: the tournament slug a page path starts with — the slug alone, or the slug followed by any page. Knows nothing of
   * other page kinds that share this shape (a roster page, the teams page, a
   * match page); a caller wanting those told apart checks them first. Never
   * throws.
   */
  matchFrontendPath(path: string): string | undefined {
    return TOURNAMENT_FRONTEND_PATH.exec(path)?.[1];
  }

  /**
   * The reverse of the scores page path a phase request is sent from: the
   * tournament slug of exactly a scores page path; undefined for any other path (the bare tournament,
   * another of its pages, or anything deeper under the scores page). Never
   * throws.
   */
  matchScoresFrontendPath(path: string): string | undefined {
    const [slug, page, ...rest] = path.split('/');
    return slug !== '' && page === SCORES_PAGE && rest.length === 0
      ? slug
      : undefined;
  }

  /**
   * The tournament itself, sent from the page the caller is on: the bulk
   * download loads it from the news page, the live bracket fetch from the
   * scores page.
   */
  request(baseUrls: TpBaseUrls, slug: string, page: string): TpRequest {
    return this.toRequest(baseUrls, slug, { path: this.apiPath(slug), page });
  }

  phaseRequest(baseUrls: TpBaseUrls, slug: string, phaseId: number): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.phaseApiPath(slug, phaseId),
      page: SCORES_PAGE,
    });
  }

  phaseRoundRequest(
    baseUrls: TpBaseUrls,
    slug: string,
    { phaseId, roundNumber }: TpPhaseRound,
  ): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.phaseRoundApiPath(slug, phaseId, roundNumber),
      page: SCORES_PAGE,
    });
  }

  inscriptionsRequest(
    baseUrls: TpBaseUrls,
    slug: string,
    categoryId: number,
  ): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.inscriptionsApiPath(slug, categoryId),
      page: 'players',
    });
  }

  awardsRequest(baseUrls: TpBaseUrls, slug: string): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.awardsApiPath(slug),
      page: 'awards',
    });
  }

  newsRequest(baseUrls: TpBaseUrls, slug: string): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.newsApiPath(slug),
      page: 'news',
    });
  }

  classificationsRequest(
    baseUrls: TpBaseUrls,
    slug: string,
    phaseId: number,
  ): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.classificationsApiPath(slug, phaseId),
      page: 'classifications',
    });
  }

  teamStatsRequest(baseUrls: TpBaseUrls, slug: string): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.teamStatsApiPath(slug),
      page: 'honours',
    });
  }

  lineupStatsRequest(baseUrls: TpBaseUrls, slug: string): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.lineupStatsApiPath(slug),
      page: 'honours',
    });
  }

  coachStatsRequest(baseUrls: TpBaseUrls, slug: string): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.coachStatsApiPath(slug),
      page: 'honours',
    });
  }

  statisticsRequest(baseUrls: TpBaseUrls, slug: string): TpRequest {
    return this.toRequest(baseUrls, slug, {
      path: this.statisticsApiPath(slug),
      page: 'statistics',
    });
  }

  /** The tournament itself: its categories and their phases. */
  private apiPath(slug: string): string {
    return `tournament/${slug}`;
  }

  /** One phase's fixtures, as first loaded: only its current round's matches. */
  private phaseApiPath(slug: string, phaseId: number): string {
    return `tournament/${slug}/phases?page=0&pageSize=50&phaseId=${phaseId}&type=COACH`;
  }

  /** One specific round of a phase, as the frontend's round tabs request it. */
  private phaseRoundApiPath(
    slug: string,
    phaseId: number,
    roundNumber: number,
  ): string {
    return `${this.phaseApiPath(slug, phaseId)}&round=${roundNumber}`;
  }

  /** One category's registered participants, as the players page loads them. */
  private inscriptionsApiPath(slug: string, categoryId: number): string {
    return `inscriptions/${slug}/category/${categoryId}/inscriptions?page=0&pageSize=75`;
  }

  /** The tournament's awards, as the awards page loads them. */
  private awardsApiPath(slug: string): string {
    return `awards/${slug}/awards`;
  }

  /** The tournament's news, as the news page loads it. */
  private newsApiPath(slug: string): string {
    return `tournament/${slug}/news`;
  }

  /** A phase's standings. "clasifications" is TP's own spelling. */
  private classificationsApiPath(slug: string, phaseId: number): string {
    return `tournament/${slug}/clasifications?page=0&pageSize=75&phaseId=${phaseId}&type=COACH`;
  }

  /** The honours page's default Team view. */
  private teamStatsApiPath(slug: string): string {
    return `tournament/${slug}/team-stats`;
  }

  /** The honours page's Player toggle. */
  private lineupStatsApiPath(slug: string): string {
    return `tournament/${slug}/lineup-stats`;
  }

  /** The honours page's Coach toggle. */
  private coachStatsApiPath(slug: string): string {
    return `tournament/${slug}/coach-stats`;
  }

  /** The tournament's statistics, as the statistics page loads them. */
  private statisticsApiPath(slug: string): string {
    return `tournament/${slug}/statistics`;
  }

  /** One of the tournament's pages (e.g. `scores`, `news`). */
  private frontendPath(slug: string, page: string): string {
    return `${slug}/${page}`;
  }

  /** An API path paired with the tournament page it is sent from. */
  private toRequest(
    baseUrls: TpBaseUrls,
    slug: string,
    call: { path: string; page: string },
  ): TpRequest {
    return {
      path: call.path,
      url: baseUrls.getBackendApiUrl() + call.path,
      referer:
        baseUrls.getFrontendBaseUrl() + this.frontendPath(slug, call.page),
    };
  }
}
