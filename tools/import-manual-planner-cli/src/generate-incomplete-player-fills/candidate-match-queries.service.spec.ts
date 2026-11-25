import { matches, matchTeams } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CandidateMatchQueriesService } from './candidate-match-queries.service';
import { renderedWhere, renderSql } from './fill-query.test-helpers';
import { FillRowShapesService } from './fill-row-shapes.service';

const at = (iso: string): Date => new Date(iso);

describe('CandidateMatchQueriesService', () => {
  let service: CandidateMatchQueriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // FillRowShapesService is pure and dependency-free: passed real.
      providers: [CandidateMatchQueriesService, FillRowShapesService],
    }).compile();
    service = moduleRef.get(CandidateMatchQueriesService);
  });

  it('reads whether match events record a stat reduction or a death per candidate', async () => {
    const rows = [
      { playerId: 1, hasStatReduction: false, hasDeath: true },
      { playerId: 2, hasStatReduction: true, hasDeath: false },
    ];
    const { db, chains } = mockDb(rows);

    await expect(service.consequences(db, [1, 2])).resolves.toEqual(rows);

    const where = renderedWhere(chains[0]);
    expect(where.params).toEqual([
      1,
      2,
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      'death',
    ]);
    const fields = (db.select as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as Record<string, unknown>;
    expect(renderSql(fields.hasStatReduction).sql).toMatch(
      /^bool_or\(.*"consequence_type" in /,
    );
    expect(renderSql(fields.hasDeath).sql).toMatch(
      /^bool_or\(.*"consequence_type" = \$1\)$/,
    );
  });

  it('times each death by its earliest match, unless a later match event names him', async () => {
    const { db, chains } = mockDb(
      [
        { playerId: 1, diedAt: at('2024-03-15T19:00:00Z') },
        { playerId: 2, diedAt: at('2024-01-01T19:00:00Z') },
      ],
      [
        {
          actingPlayerId: 7,
          consequencePlayerId: 1,
          lastPlayedAt: at('2024-03-15T19:00:00Z'),
        },
        {
          actingPlayerId: 2,
          consequencePlayerId: null,
          lastPlayedAt: at('2024-02-01T19:00:00Z'),
        },
      ],
    );

    await expect(service.deathTimes(db, [1, 2, 3])).resolves.toEqual([
      { playerId: 1, diedAt: '2024-03-15T19:00:00.000Z' },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual(['death', 1, 2, 3]);
    expect(renderedWhere(chains[1]).params).toEqual([1, 2, 1, 2]);
  });

  it('reads each stat reduction with its characteristic, competition and match time', async () => {
    const { db, chains } = mockDb([
      {
        playerId: 2,
        consequenceType: 'stat_reduction_pa',
        competitionId: 50,
        playedAt: at('2024-03-01T19:00:00Z'),
      },
    ]);

    await expect(service.statReductionEvents(db, [2])).resolves.toEqual([
      {
        playerId: 2,
        characteristic: 'pa',
        competitionId: 50,
        playedAt: '2024-03-01T19:00:00.000Z',
      },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual(
      expect.arrayContaining([2, 'stat_reduction_ma', 'stat_reduction_pa']),
    );
  });

  it('gives each player every competition his team era played, with its first and last match', async () => {
    const { db, chains } = mockDb([
      {
        teamEraId: 21,
        competitionId: 50,
        firstPlayedAt: at('2024-02-01T19:00:00Z'),
        lastPlayedAt: at('2024-04-01T19:00:00Z'),
      },
      {
        teamEraId: 22,
        competitionId: 51,
        firstPlayedAt: at('2024-05-01T19:00:00Z'),
        lastPlayedAt: at('2024-05-01T19:00:00Z'),
      },
    ]);

    await expect(
      service.teamCompetitions(db, [
        { playerId: 2, teamEraId: 21 },
        { playerId: 3, teamEraId: 21 },
      ]),
    ).resolves.toEqual([
      {
        playerId: 2,
        competitionId: 50,
        firstPlayedAt: '2024-02-01T19:00:00.000Z',
        lastPlayedAt: '2024-04-01T19:00:00.000Z',
      },
      {
        playerId: 3,
        competitionId: 50,
        firstPlayedAt: '2024-02-01T19:00:00.000Z',
        lastPlayedAt: '2024-04-01T19:00:00.000Z',
      },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual([21]);
    expect(chains[0].groupBy).toHaveBeenCalledWith(
      matchTeams.teamEraId,
      matches.competitionId,
    );
  });

  it('reads no consequences without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.consequences(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('times no deaths without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.deathTimes(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('reads no stat reductions without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.statReductionEvents(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('reads no team competitions without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.teamCompetitions(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('reads no appearances when no candidate died', async () => {
    const { db, chains } = mockDb([]);

    await expect(service.deathTimes(db, [1])).resolves.toEqual([]);

    expect(chains).toHaveLength(1);
  });
});
