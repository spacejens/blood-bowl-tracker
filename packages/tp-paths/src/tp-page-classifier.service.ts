import { Injectable } from '@nestjs/common';

import { TpMatchPathsService } from './tp-match-paths.service';
import { TpOfficialTeamsPathsService } from './tp-official-teams-paths.service';
import { TpRosterPathsService } from './tp-roster-paths.service';
import { TpTournamentPathsService } from './tp-tournament-paths.service';

/**
 * Which kind of TP frontend page a URL points to, carrying exactly the ids
 * the matching packages/import-tp-live entry point needs to import it. A
 * caller passes the fields straight through, adding only `era`/`session`.
 */
export type TpPageClassification =
  | { kind: 'competition'; tournamentSlug: string }
  | { kind: 'match'; tournamentSlug: string; matchId: number }
  | { kind: 'roster'; rosterId: number }
  | { kind: 'officialTeams' }
  | { kind: 'unknown' };

const UNKNOWN: TpPageClassification = { kind: 'unknown' };

/**
 * Decides which kind of TP frontend page a full URL points to, by reversing
 * the page paths the Tp*PathsServices build. Shared so every consumer (a
 * slash command, feed monitoring) makes the same determination. Never
 * throws: a malformed URL, one outside TP's frontend, or an unrecognized
 * page shape is an expected outcome of user or feed input, so it is
 * `unknown` rather than an error. The frontend base URL is a parameter,
 * not config, so this package stays free of I/O and config.
 */
@Injectable()
export class TpPageClassifierService {
  constructor(
    private readonly roster: TpRosterPathsService,
    private readonly officialTeams: TpOfficialTeamsPathsService,
    private readonly match: TpMatchPathsService,
    private readonly tournament: TpTournamentPathsService,
  ) {}

  classify(url: string, frontendBaseUrl: string): TpPageClassification {
    const path = this.relativePath(url, frontendBaseUrl);
    if (path === undefined) return UNKNOWN;

    const rosterId = this.roster.matchFrontendPath(path);
    if (rosterId !== undefined) return { kind: 'roster', rosterId };

    if (this.officialTeams.matchFrontendPath(path)) {
      return { kind: 'officialTeams' };
    }

    const match = this.match.matchFrontendPath(path);
    if (match) return { kind: 'match', ...match };

    if (this.isOwnedByMoreSpecificKind(path)) return UNKNOWN;
    const tournamentSlug = this.tournament.matchFrontendPath(path);
    if (tournamentSlug !== undefined) {
      return { kind: 'competition', tournamentSlug };
    }

    return UNKNOWN;
  }

  /**
   * `url`'s path relative to `frontendBaseUrl`, without trailing slashes,
   * query string or fragment; undefined when either URL is malformed or
   * `url` is not under the base (same origin, path below the base path).
   */
  private relativePath(
    url: string,
    frontendBaseUrl: string,
  ): string | undefined {
    let parsed: URL;
    let base: URL;
    try {
      parsed = new URL(url);
      base = new URL(frontendBaseUrl);
    } catch {
      return undefined;
    }
    if (parsed.origin !== base.origin) return undefined;
    const basePath = base.pathname.endsWith('/')
      ? base.pathname
      : `${base.pathname}/`;
    if (!parsed.pathname.startsWith(basePath)) return undefined;
    return parsed.pathname.slice(basePath.length).replace(/\/+$/, '');
  }

  /**
   * Whether a path that no more specific matcher accepted still carries the
   * marker of a more specific kind — a leading `roster`/`teams` segment, or
   * a `match` second segment — and so is a malformed page of that kind
   * (e.g. a non-numeric id), not a competition page. The markers are read
   * off each kind's own forward path builder so they are not restated here.
   */
  private isOwnedByMoreSpecificKind(path: string): boolean {
    const [first, second] = path.split('/');
    const [rosterRoot] = this.roster.frontendPath(1).split('/');
    const officialTeamsRoot = this.officialTeams.frontendPath();
    const [, matchMarker] = this.match.frontendPath('slug', 1).split('/');
    return (
      first === rosterRoot ||
      first === officialTeamsRoot ||
      second === matchMarker
    );
  }
}
