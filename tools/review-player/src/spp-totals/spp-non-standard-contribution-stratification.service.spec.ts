import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { SppNonStandardContributionStratificationService } from './spp-non-standard-contribution-stratification.service';

const STRATUM = 'spp-non-standard-contribution';

async function makeService(
  dbResult: MockDbResult,
): Promise<SppNonStandardContributionStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  // PlayerProjectionQueryService injects DB and issues a real query, so it
  // doesn't qualify for this repo's real-provider exemptions — mock it and
  // hand back a chain sourced from the same mockDb helper used below, so the
  // `dbResult.chains` assertions still see exactly what this service issued.
  const query = mock<PlayerProjectionQueryService>();
  query.base.mockImplementation(() => dbResult.db.select() as never);
  const moduleRef = await Test.createTestingModule({
    providers: [
      SppNonStandardContributionStratificationService,
      { provide: PlayerProjectionQueryService, useValue: query },
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(SppNonStandardContributionStratificationService);
}

/** Issue one sample against the supplied mock db, for chain assertions. */
async function sample(dbResult: MockDbResult): Promise<void> {
  const service = await makeService(dbResult);
  await service.sampleStratum({ source: 'tp', stratumId: STRATUM, limit: 3 });
}

describe('SppNonStandardContributionStratificationService', () => {
  it('offers one TP-only stratum', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: STRATUM,
        label: 'Non-standard SPP per event',
        sources: ['tp'],
      },
    ]);
  });

  it('returns the sampled players tagged with the requested source', async () => {
    const service = await makeService(
      mockDb([
        {
          playerId: 42,
          externalId: '1000',
          playerName: 'Janhorgh',
          teamName: 'Bockar',
          positionName: 'Lineman',
          eraName: 'Third Era',
        },
      ]),
    );

    expect(
      await service.sampleStratum({
        source: 'tp',
        stratumId: STRATUM,
        limit: 3,
      }),
    ).toEqual([
      {
        source: 'tp',
        playerId: 42,
        externalId: '1000',
        playerName: 'Janhorgh',
        teamName: 'Bockar',
        positionName: 'Lineman',
        eraName: 'Third Era',
      },
    ]);
  });

  it('applies the requested limit — a broad match must not flood the report', async () => {
    const dbResult = mockDb([]);

    await sample(dbResult);

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
  });

  it('samples randomly rather than in a stable order', async () => {
    const dbResult = mockDb([]);

    await sample(dbResult);

    const order = dbResult.chains[0].orderBy.mock.calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(order).sql).toContain('random()');
  });

  it("joins only the player's own action events", async () => {
    const dbResult = mockDb([]);

    await sample(dbResult);

    const joinCondition = dbResult.chains[0].innerJoin.mock.calls[0][1] as SQL;
    const { sql: rendered } = new PgDialect().sqlToQuery(joinCondition);
    expect(rendered).toContain('"acting_player_id"');
    // Only action events can carry an award; consequence-only and
    // weather/inducements/winnings events have no action type at all.
    expect(rendered).toMatch(/"action_type"\s+is not null/i);
  });

  it('compares the recorded per-event value against the award table, treating a missing row as zero', async () => {
    const dbResult = mockDb([]);

    await sample(dbResult);

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    // Render the real captured drizzle condition to queryable SQL text and
    // check its key characteristics rather than the exact string:
    // `PgDialect#sqlToQuery` is not a stable public API and this repo depends
    // on prerelease drizzle-orm, so exact spacing/schema-qualification is
    // fragile to assert on directly.
    const { sql: rendered } = new PgDialect().sqlToQuery(condition);
    // The recorded per-event figure is the left-hand side...
    expect(rendered).toMatch(
      /coalesce\([^)]*spp_value[^)]*\)\s*is distinct from/i,
    );
    // ...and the right-hand side re-derives the expected award independently,
    // from spp_award_values via era_rules_sets — never via packages/game-data.
    expect(rendered).toContain('spp_award_values');
    expect(rendered).toContain('era_rules_sets');
    expect(rendered).toContain('"action_type"');
    // An action type with no row at all (e.g. `foul`) is an expected award of
    // zero, not "no answer" — hence the outer coalesce around the subquery.
    expect(rendered).toMatch(/coalesce\(\s*\(\s*select/i);
    // Baseline (NULL race) rows and the team's own race-specific row both
    // match; the race-specific row must win, which `nulls last` + `limit 1`
    // encodes.
    expect(rendered).toContain('"race_id"');
    expect(rendered).toMatch(/nulls last/i);
    expect(rendered).toMatch(/limit 1/i);
  });

  it('reports each affected player once however many of their events disagree', async () => {
    const dbResult = mockDb([]);

    await sample(dbResult);

    expect(dbResult.chains[0].groupBy).toHaveBeenCalled();
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ source: 'tp', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
