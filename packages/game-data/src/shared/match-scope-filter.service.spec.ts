import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from './fact-scope';
import { MatchScopeFilterService } from './match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
} from './query-assertions.test-helpers';

describe('MatchScopeFilterService', () => {
  let service: MatchScopeFilterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MatchScopeFilterService],
    }).compile();
    service = moduleRef.get(MatchScopeFilterService);
  });

  it('builds no condition at all for an unscoped fact scope', () => {
    expect(service.build(FACT_SCOPE_ALL_TIME)).toBeUndefined();
  });

  it('filters on the league via the eras join', () => {
    const condition = service.build({ leagueId: 9 });
    expect(extractAllFilterValues(condition)).toEqual([9]);
    expect(extractJoinColumns(condition)).toEqual(['eras.league_id']);
  });

  it('filters on the era via the team_eras join', () => {
    const condition = service.build({ eraId: 20 });
    expect(extractAllFilterValues(condition)).toEqual([20]);
    expect(extractJoinColumns(condition)).toEqual(['team_eras.era_id']);
  });

  it('filters on the competition via matches', () => {
    const condition = service.build({ competitionId: 30 });
    expect(extractAllFilterValues(condition)).toEqual([30]);
    expect(extractJoinColumns(condition)).toEqual(['matches.competition_id']);
  });

  it('filters on the match category via matches', () => {
    const condition = service.build({ category: 'season_final' });
    expect(extractAllFilterValues(condition)).toEqual(['season_final']);
    expect(extractJoinColumns(condition)).toEqual(['matches.category']);
  });

  it('combines every scope field, in league/era/competition/category order', () => {
    const condition = service.build({
      leagueId: 9,
      eraId: 20,
      competitionId: 30,
      category: 'season_final',
    });
    expect(extractAllFilterValues(condition)).toEqual([
      9,
      20,
      30,
      'season_final',
    ]);
    expect(extractJoinColumns(condition)).toEqual([
      'eras.league_id',
      'team_eras.era_id',
      'matches.competition_id',
      'matches.category',
    ]);
  });
});
