import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  OutcomeMatch,
  ResolveOutcomesInput,
} from './match-outcome-resolver.service';
import { MatchOutcomeResolverService } from './match-outcome-resolver.service';

function match(
  overrides: Partial<OutcomeMatch> & Pick<OutcomeMatch, 'matchId'>,
): OutcomeMatch {
  return {
    category: 'normal',
    teams: [
      { matchTeamId: overrides.matchId * 10 + 1, teamEraId: 101, score: 0 },
      { matchTeamId: overrides.matchId * 10 + 2, teamEraId: 102, score: 0 },
    ],
    ...overrides,
  };
}

function input(
  matches: OutcomeMatch[],
  hints: Partial<Pick<ResolveOutcomesInput, 'overrides' | 'tieBreaks'>> = {},
): ResolveOutcomesInput {
  return {
    matches,
    overrides: hints.overrides ?? new Map<number, number | null>(),
    tieBreaks: hints.tieBreaks ?? new Map<number, number | null>(),
  };
}

describe('MatchOutcomeResolverService', () => {
  let service: MatchOutcomeResolverService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MatchOutcomeResolverService],
    }).compile();
    service = moduleRef.get(MatchOutcomeResolverService);
  });

  it('picks the higher score as the winner', () => {
    const m = match({
      matchId: 1,
      teams: [
        { matchTeamId: 11, teamEraId: 101, score: 3 },
        { matchTeamId: 12, teamEraId: 102, score: 1 },
      ],
    });
    expect(service.resolve(input([m]))).toEqual({
      resolved: [{ matchId: 1, winningMatchTeamId: 11 }],
      unresolvedMatchIds: [],
    });
  });

  it('records a tied normal match as a draw', () => {
    expect(service.resolve(input([match({ matchId: 1 })]))).toEqual({
      resolved: [{ matchId: 1, winningMatchTeamId: null }],
      unresolvedMatchIds: [],
    });
  });

  it('leaves a tied cup final unresolved with no hint', () => {
    const m = match({ matchId: 1, category: 'cup_final' });
    expect(service.resolve(input([m]))).toEqual({
      resolved: [],
      unresolvedMatchIds: [1],
    });
  });

  it('uses a tie-break hint for a tied cup final', () => {
    const m = match({ matchId: 1, category: 'cup_final' });
    const result = service.resolve(
      input([m], { tieBreaks: new Map([[1, 102]]) }),
    );
    expect(result.resolved).toEqual([{ matchId: 1, winningMatchTeamId: 12 }]);
  });

  it('records a draw when a tie-break hint says draw', () => {
    const m = match({ matchId: 1, category: 'cup_final' });
    const result = service.resolve(
      input([m], { tieBreaks: new Map([[1, null]]) }),
    );
    expect(result.resolved).toEqual([{ matchId: 1, winningMatchTeamId: null }]);
  });

  it('lets an override beat a decisive score', () => {
    const m = match({
      matchId: 1,
      teams: [
        { matchTeamId: 11, teamEraId: 101, score: 3 },
        { matchTeamId: 12, teamEraId: 102, score: 1 },
      ],
    });
    const result = service.resolve(
      input([m], { overrides: new Map([[1, 102]]) }),
    );
    expect(result.resolved).toEqual([{ matchId: 1, winningMatchTeamId: 12 }]);
  });

  it('resolves a tied semifinal from who reached the final', () => {
    const semi = match({ matchId: 1, category: 'season_semi_final' });
    const final = match({
      matchId: 2,
      category: 'season_final',
      teams: [
        { matchTeamId: 21, teamEraId: 102, score: 2 },
        { matchTeamId: 22, teamEraId: 103, score: 1 },
      ],
    });
    const result = service.resolve(input([semi, final]));
    expect(result.resolved).toContainEqual({
      matchId: 1,
      winningMatchTeamId: 12,
    });
  });

  it('ignores the bronze match when tracing a semifinal winner', () => {
    const semi = match({ matchId: 1, category: 'season_semi_final' });
    const bronze = match({
      matchId: 2,
      category: 'season_bronze',
      teams: [
        { matchTeamId: 21, teamEraId: 101, score: 2 },
        { matchTeamId: 22, teamEraId: 104, score: 1 },
      ],
    });
    const final = match({
      matchId: 3,
      category: 'season_final',
      teams: [
        { matchTeamId: 31, teamEraId: 102, score: 2 },
        { matchTeamId: 32, teamEraId: 103, score: 1 },
      ],
    });
    const result = service.resolve(input([semi, bronze, final]));
    expect(result.resolved).toContainEqual({
      matchId: 1,
      winningMatchTeamId: 12,
    });
  });

  it('resolves a tied qualifier from who reached the semifinals', () => {
    const qualifier = match({ matchId: 1, category: 'season_qualifier' });
    const semi = match({
      matchId: 2,
      category: 'season_semi_final',
      teams: [
        { matchTeamId: 21, teamEraId: 101, score: 2 },
        { matchTeamId: 22, teamEraId: 103, score: 1 },
      ],
    });
    const result = service.resolve(input([qualifier, semi]));
    expect(result.resolved).toContainEqual({
      matchId: 1,
      winningMatchTeamId: 11,
    });
  });

  it('prefers bracket progression over a drawn tie-break hint on a semifinal', () => {
    const semi = match({ matchId: 1, category: 'season_semi_final' });
    const final = match({
      matchId: 2,
      category: 'season_final',
      teams: [
        { matchTeamId: 21, teamEraId: 102, score: 2 },
        { matchTeamId: 22, teamEraId: 103, score: 1 },
      ],
    });
    const result = service.resolve(
      input([semi, final], { tieBreaks: new Map([[1, null]]) }),
    );
    expect(result.resolved).toContainEqual({
      matchId: 1,
      winningMatchTeamId: 12,
    });
  });

  it('leaves a semifinal unresolved when both participants reached the final', () => {
    const semi = match({ matchId: 1, category: 'season_semi_final' });
    const final = match({
      matchId: 2,
      category: 'season_final',
      teams: [
        { matchTeamId: 21, teamEraId: 101, score: 2 },
        { matchTeamId: 22, teamEraId: 102, score: 1 },
      ],
    });
    const result = service.resolve(input([semi, final]));
    expect(result.unresolvedMatchIds).toEqual([1]);
  });

  it('leaves a match unresolved when a hint names a non-participant', () => {
    const m = match({ matchId: 1, category: 'cup_final' });
    const result = service.resolve(
      input([m], { overrides: new Map([[1, 999]]) }),
    );
    expect(result).toEqual({ resolved: [], unresolvedMatchIds: [1] });
  });

  it('leaves a non-normal match with fewer than two participants unresolved', () => {
    const m = match({
      matchId: 1,
      category: 'cup_final',
      teams: [{ matchTeamId: 11, teamEraId: 101, score: 0 }],
    });
    expect(service.resolve(input([m])).unresolvedMatchIds).toEqual([1]);
  });

  it('leaves a normal match with fewer than two participants unresolved rather than a draw', () => {
    const m = match({
      matchId: 1,
      category: 'normal',
      teams: [{ matchTeamId: 11, teamEraId: 101, score: 0 }],
    });
    expect(service.resolve(input([m]))).toEqual({
      resolved: [],
      unresolvedMatchIds: [1],
    });
  });
});
