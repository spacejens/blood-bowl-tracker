import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { MatchOutcomeResolverService } from './match-outcome-resolver.service';
import { MatchOutcomesService } from './match-outcomes.service';

describe('MatchOutcomesService', () => {
  let service: MatchOutcomesService;
  let resolver: MockProxy<MatchOutcomeResolverService>;
  let chains: QueryChain[];
  let db: Db;

  async function build(...rowsPerQuery: unknown[][]): Promise<void> {
    ({ db, chains } = mockDb(...rowsPerQuery));
    resolver = mock<MatchOutcomeResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchOutcomesService,
        { provide: DB, useValue: db },
        { provide: MatchOutcomeResolverService, useValue: resolver },
      ],
    }).compile();
    service = moduleRef.get(MatchOutcomesService);
  }

  // query 0: matches; query 1: match teams; query 2: touchdown counts.
  const matchRows = [{ id: 1, category: 'normal', winningMatchTeamId: null }];
  const teamRows = [
    { id: 11, matchId: 1, teamEraId: 101, score: 0 },
    { id: 12, matchId: 1, teamEraId: 102, score: 0 },
  ];
  const touchdownRows = [{ matchTeamId: 11, touchdowns: 2 }];

  it('hands the resolver the counted scores', async () => {
    await build(matchRows, teamRows, touchdownRows);
    resolver.resolve.mockReturnValue({ resolved: [], unresolvedMatchIds: [] });

    await service.resolveForCompetition({
      competitionId: 7,
      overrides: [],
      tieBreaks: [],
    });

    expect(resolver.resolve).toHaveBeenCalledWith({
      matches: [
        {
          matchId: 1,
          category: 'normal',
          teams: [
            { matchTeamId: 11, teamEraId: 101, score: 2 },
            { matchTeamId: 12, teamEraId: 102, score: 0 },
          ],
        },
      ],
      overrides: new Map(),
      tieBreaks: new Map(),
    });
  });

  it('turns hint lists into maps, keeping an explicit null', async () => {
    await build(matchRows, teamRows, touchdownRows);
    resolver.resolve.mockReturnValue({ resolved: [], unresolvedMatchIds: [] });

    await service.resolveForCompetition({
      competitionId: 7,
      overrides: [{ matchId: 1, winnerTeamEraId: null }],
      tieBreaks: [{ matchId: 1, winnerTeamEraId: 102 }],
    });

    const call = resolver.resolve.mock.calls[0][0];
    expect(call.overrides.get(1)).toBeNull();
    expect(call.overrides.has(1)).toBe(true);
    expect(call.tieBreaks.get(1)).toBe(102);
  });

  it('writes only the scores that changed', async () => {
    await build(matchRows, teamRows, touchdownRows);
    resolver.resolve.mockReturnValue({ resolved: [], unresolvedMatchIds: [] });

    await service.resolveForCompetition({
      competitionId: 7,
      overrides: [],
      tieBreaks: [],
    });

    // one update for match team 11 (0 -> 2); none for 12 (already 0).
    const updates = chains.slice(3);
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toHaveBeenCalledWith({ score: 2 });
  });

  it('writes a resolved winner and reports it', async () => {
    await build(matchRows, teamRows, []);
    resolver.resolve.mockReturnValue({
      resolved: [{ matchId: 1, winningMatchTeamId: 12 }],
      unresolvedMatchIds: [],
    });

    const result = await service.resolveForCompetition({
      competitionId: 7,
      overrides: [],
      tieBreaks: [],
    });

    expect(result).toEqual({
      competitionId: 7,
      resolvedMatchIds: [1],
      unresolvedMatchIds: [],
    });
    const winnerUpdate = chains.at(-1)!;
    expect(winnerUpdate.set).toHaveBeenCalledWith({ winningMatchTeamId: 12 });
  });

  it('does not write anything for an unresolved match', async () => {
    await build(matchRows, teamRows, []);
    resolver.resolve.mockReturnValue({
      resolved: [],
      unresolvedMatchIds: [1],
    });

    const result = await service.resolveForCompetition({
      competitionId: 7,
      overrides: [],
      tieBreaks: [],
    });

    expect(result.unresolvedMatchIds).toEqual([1]);
    // 3 reads, no writes at all (no score changed either).
    expect(chains).toHaveLength(3);
  });

  it('skips a winner write when the stored value already matches', async () => {
    await build(
      [{ id: 1, category: 'normal', winningMatchTeamId: 12 }],
      teamRows,
      [],
    );
    resolver.resolve.mockReturnValue({
      resolved: [{ matchId: 1, winningMatchTeamId: 12 }],
      unresolvedMatchIds: [],
    });

    const result = await service.resolveForCompetition({
      competitionId: 7,
      overrides: [],
      tieBreaks: [],
    });

    expect(result.resolvedMatchIds).toEqual([1]);
    expect(chains).toHaveLength(3);
  });
});
