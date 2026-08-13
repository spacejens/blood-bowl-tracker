import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { SppDiscrepancyStratificationService } from './spp-discrepancy-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<SppDiscrepancyStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      SppDiscrepancyStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(SppDiscrepancyStratificationService);
}

describe('SppDiscrepancyStratificationService', () => {
  it('offers one always-on discrepancy stratum for both sources', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'spp-discrepancy',
        label: 'SPP totals disagree',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('returns every disagreeing player, tagged with the source', async () => {
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
        source: 'bbl',
        stratumId: 'spp-discrepancy',
        limit: 3,
      }),
    ).toEqual([
      {
        source: 'bbl',
        playerId: 42,
        externalId: '1000',
        playerName: 'Janhorgh',
        teamName: 'Bockar',
        positionName: 'Lineman',
        eraName: 'Third Era',
      },
    ]);
  });

  it('ignores the sample limit — a real discrepancy is never sampled away', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'tp',
      stratumId: 'spp-discrepancy',
      limit: 3,
    });

    expect(dbResult.chains[0].limit).not.toHaveBeenCalled();
  });

  it('compares the stored total against computed plus adjustment, with NULL-safe semantics', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'spp-discrepancy',
      limit: 3,
    });

    const havingCondition = dbResult.chains[0].having.mock.calls[0][0] as SQL;
    // Render the real captured drizzle condition to queryable SQL text (no
    // mocking involved here — this is the same rendering drizzle itself
    // would send to Postgres) and check for the key characteristics, rather
    // than the exact rendered string: `PgDialect#sqlToQuery` is not a stable
    // public API, and this repo depends on prerelease drizzle-orm, so exact
    // spacing/schema-qualification is fragile to assert on directly. What
    // matters, and is checked below:
    //  - the adjustment is added to the computed sum before comparing
    //    (`coalesce(...spp_adjustment...)`), which is the bug fix;
    //  - the comparison uses `IS DISTINCT FROM`; and
    //  - the right-hand side is the bare `spp_total` column, not wrapped in
    //    its own `coalesce`. Since the left side is always a plain number
    //    (both terms are `coalesce`d) and the right side is left as a bare
    //    column, standard SQL `IS DISTINCT FROM` semantics guarantee a NULL
    //    `spp_total` is always "distinct from" it — i.e. always a mismatch.
    const { sql: rendered } = new PgDialect().sqlToQuery(havingCondition);
    expect(rendered).toMatch(/coalesce\([^)]*spp_adjustment[^)]*\)/);
    expect(rendered).toMatch(/is distinct from/i);
    expect(rendered).toContain('"spp_total"');
    expect(rendered).not.toMatch(/coalesce\([^)]*spp_total[^)]*\)/);
    // The four checks above alone don't pin down which SIDE of the
    // comparison the adjustment lands on: a regressed condition like
    // `computed is distinct from "spp_total" + coalesce("spp_adjustment", 0)`
    // (adjustment added to the stored total instead of the computed sum)
    // would satisfy all four while being semantically wrong. Assert the
    // adjustment coalesce sits immediately before `is distinct from` — i.e.
    // it's combined into the computed-sum side of the comparison, not the
    // `spp_total` side.
    expect(rendered).toMatch(
      /coalesce\([^)]*spp_adjustment[^)]*\)\s*is distinct from/i,
    );
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });

  it('scopes the roster filter to non-star players or a star player with a stored total', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'spp-discrepancy',
      limit: 3,
    });

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { sql: rendered, params } = new PgDialect().sqlToQuery(condition);
    // Excludes only the expected-always-mismatch case (a star player with no
    // stored total at all) — not every star player outright. A star player
    // who does carry a real stored total must stay eligible for this
    // uncapped stratum, or a genuine mismatch on them would only ever be
    // caught by luck in StarPlayerStratificationService's bounded sample.
    expect(rendered).toContain('"is_star_player"');
    expect(rendered).toMatch(/\bor\b/i);
    expect(rendered).toMatch(/"spp_total"\s+is not null/i);
    // drizzle parameterizes the boolean, so the rendered SQL text alone is
    // identical for `true` and `false` — assert the bound value too, or a
    // regression that flips the star-player half of the condition would
    // leave this test green.
    expect(params).toEqual([false]);
  });
});
