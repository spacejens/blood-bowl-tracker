import { matchTeams, sql } from '@blood-bowl-tracker/db';
import {
  extractAllFilterValues,
  extractJoinColumns,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  FACT_SCOPE_ALL_TIME,
  LASTING_INJURY_SUFFERED_TYPES,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MIN_MATCHES_FOR_PER_MATCH_AVERAGE,
  PerMatchAverageSqlService,
} from './per-match-average-sql.service';

describe('PerMatchAverageSqlService', () => {
  let service: PerMatchAverageSqlService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PerMatchAverageSqlService],
    }).compile();
    service = moduleRef.get(PerMatchAverageSqlService);
  });

  it('floors the average at five matches', () => {
    expect(MIN_MATCHES_FOR_PER_MATCH_AVERAGE).toBe(5);
  });

  describe('average', () => {
    it('divides the summed per-side value by distinct matches, rounded to two decimals as a double', () => {
      const average = service.average(sql`${matchTeams.score}`);
      const text = sqlText(average);
      expect(text).toContain('round(sum(');
      expect(text).toContain('::numeric / count(distinct ');
      expect(text).toContain(', 2)::double precision');
      expect(extractJoinColumns(average)).toEqual([
        'match_teams.score',
        'matches.id',
      ]);
    });
  });

  describe('minimumMatches', () => {
    it('requires at least the minimum number of distinct matches', () => {
      const having = service.minimumMatches();
      expect(sqlText(having)).toContain('count(distinct ');
      expect(sqlText(having)).toContain(' >= ');
      expect(extractJoinColumns(having)).toEqual(['matches.id']);
      expect(extractAllFilterValues(having)).toEqual([
        MIN_MATCHES_FOR_PER_MATCH_AVERAGE,
      ]);
    });
  });

  describe('scopeFilter', () => {
    it('filters by league', () => {
      const filter = service.scopeFilter({ leagueId: 9 });
      expect(extractAllFilterValues(filter)).toEqual([9]);
      expect(extractJoinColumns(filter)).toEqual(['eras.league_id']);
    });

    it('filters by era', () => {
      const filter = service.scopeFilter({ eraId: 20 });
      expect(extractAllFilterValues(filter)).toEqual([20]);
      expect(extractJoinColumns(filter)).toEqual(['team_eras.era_id']);
    });

    it('filters by match category', () => {
      const filter = service.scopeFilter({ category: 'season_final' });
      expect(extractAllFilterValues(filter)).toEqual(['season_final']);
      expect(extractJoinColumns(filter)).toEqual(['matches.category']);
    });

    it('applies no filter all-time', () => {
      expect(service.scopeFilter(FACT_SCOPE_ALL_TIME)).toBeUndefined();
    });

    it('ignores the competition scope', () => {
      expect(service.scopeFilter({ competitionId: 30 })).toBeUndefined();
    });
  });

  describe('matchEventsOnSide', () => {
    it('counts the acting side’s events by action type, once per side', () => {
      const { perMatchValue, perSideJoin } = service.matchEventsOnSide({
        role: 'acting',
        types: CASUALTY_CAUSED_TYPES,
      });
      expect(sqlText(perMatchValue)).toContain(
        'coalesce(side_event_counts.event_count, 0)',
      );
      const derivedText = sqlText(perSideJoin.table);
      expect(derivedText).toMatch(
        /^\(select .* as match_team_id, count\(\*\) as event_count from /,
      );
      expect(derivedText).toContain(' group by ');
      expect(derivedText).toMatch(/\) as side_event_counts$/);
      expect(extractJoinColumns(perSideJoin.table)).toEqual([
        'match_events.acting_match_team_id',
        'match_events.action_type',
        'match_events.acting_match_team_id',
      ]);
      expect(extractAllFilterValues(perSideJoin.table)).toEqual([
        ...CASUALTY_CAUSED_TYPES,
      ]);
      expect(sqlText(perSideJoin.on)).toMatch(
        /^side_event_counts\.match_team_id = /,
      );
      expect(extractJoinColumns(perSideJoin.on)).toEqual(['match_teams.id']);
    });

    it('counts the victim side’s events by consequence type', () => {
      const { perSideJoin } = service.matchEventsOnSide({
        role: 'consequence',
        types: CASUALTY_SUFFERED_TYPES,
      });
      expect(extractJoinColumns(perSideJoin.table)).toEqual([
        'match_events.consequence_match_team_id',
        'match_events.consequence_type',
        'match_events.consequence_match_team_id',
      ]);
      expect(extractAllFilterValues(perSideJoin.table)).toEqual([
        ...CASUALTY_SUFFERED_TYPES,
      ]);
    });

    it('narrows an acting selector on the consequence of the same row', () => {
      const { perSideJoin } = service.matchEventsOnSide({
        role: 'acting',
        types: CASUALTY_CAUSED_TYPES,
        consequenceTypes: LASTING_INJURY_SUFFERED_TYPES,
      });
      expect(sqlText(perSideJoin.table)).toContain(
        'where (( in ) and ( in )) group',
      );
      expect(extractJoinColumns(perSideJoin.table)).toEqual([
        'match_events.acting_match_team_id',
        'match_events.action_type',
        'match_events.consequence_type',
        'match_events.acting_match_team_id',
      ]);
      expect(extractAllFilterValues(perSideJoin.table)).toEqual([
        ...CASUALTY_CAUSED_TYPES,
        ...LASTING_INJURY_SUFFERED_TYPES,
      ]);
    });
  });
});
