import { eras, matches, teamEras } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';

import type { FactScope } from './fact-scope';

/**
 * The league/era/competition/match-category narrowing shared by every scoped
 * query over the match-event join graph. `undefined` for a scope field means
 * "no filter" for that field, and an entirely unscoped `FactScope` builds no
 * condition at all. Pure and dependency-free: it only assembles a drizzle
 * condition, so it issues no query of its own.
 */
@Injectable()
export class MatchScopeFilterService {
  build(scope: FactScope): SQL | undefined {
    return and(
      scope.leagueId === undefined
        ? undefined
        : eq(eras.leagueId, scope.leagueId),
      scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
      scope.competitionId === undefined
        ? undefined
        : eq(matches.competitionId, scope.competitionId),
      scope.category === undefined
        ? undefined
        : eq(matches.category, scope.category),
    );
  }
}
