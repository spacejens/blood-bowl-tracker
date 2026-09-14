import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  drizzle,
  mockDb,
  PgDialect,
  SQL,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { HealedInjuryStratificationService } from './healed-injury-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
};

describe('HealedInjuryStratificationService', () => {
  let service: HealedInjuryStratificationService;
  let dbResult: MockDbResult;
  let externalSystems: MockProxy<ExternalSystemLookupService>;

  beforeEach(async () => {
    dbResult = mockDb([row]);
    externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    const query = mock<PlayerProjectionQueryService>();
    query.base.mockReturnValue(
      dbResult.db.select() as unknown as ReturnType<
        PlayerProjectionQueryService['base']
      >,
    );
    // The service also builds a real correlated EXISTS subquery through the
    // injected `Db`, which is embedded as a value inside the outer query's
    // condition rather than awaited on its own. It needs a genuine drizzle
    // query builder behind it — the auto-chaining `mockDb()` stand-in returns
    // plain mock objects, not real drizzle SQL nodes, and can't be rendered
    // by `PgDialect`. `drizzle.mock()` never connects, so it is safe to use
    // here even though it is otherwise a production driver.
    const db = drizzle.mock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealedInjuryStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(HealedInjuryStratificationService);
  });

  it('offers one stratum, for both sources', () => {
    expect(service.listStrata()).toEqual([
      {
        id: 'healed-injury',
        label: 'Player had a lasting injury that has since healed',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  const LASTING_INJURY_COLUMNS = [
    'miss_next_game',
    'niggling_injury_count',
    'move_reduction_count',
    'strength_reduction_count',
    'agility_reduction_count',
    'passing_reduction_count',
    'armour_reduction_count',
  ];

  it('requires the current row to carry no lasting injury, on every one of the seven columns', async () => {
    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'healed-injury',
      limit: 5,
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    for (const column of LASTING_INJURY_COLUMNS) {
      expect(rendered).toContain(`"players"."${column}"`);
    }
  });

  it('requires some past history version to have carried one, on every one of the seven columns', async () => {
    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'healed-injury',
      limit: 5,
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered.toLowerCase()).toContain('exists');
    // Qualified with the history table's own name, not just present anywhere
    // in the rendered SQL: the outer "current row" predicate above also
    // mentions these column names (on `players`, not `players_history`), so a
    // bare substring check would stay green even if the history-side
    // predicate referenced the wrong table or no table at all — which is
    // exactly the shape of the camelCase-on-playersHistory regression this
    // guards against (the broken columns rendered as bare, table-less
    // comparisons like `( = $8)`).
    for (const column of LASTING_INJURY_COLUMNS) {
      expect(rendered).toContain(`"players_history"."${column}"`);
    }
  });

  it('combines the two conditions with AND, not OR', async () => {
    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'healed-injury',
      limit: 5,
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    // The top-level condition is `and(noInjury(), exists(everInjured))`. If
    // this were `or(...)` instead, a currently-injured player (who fails
    // `noInjury()`) could still be sampled via the `exists` half alone —
    // exactly the "healed" stratum wrongly including still-injured players
    // failure mode the design is meant to avoid. Asserting the literal ` and `
    // token immediately before `exists (` pins the join as AND rather than OR.
    expect(rendered).toMatch(/\)\s+and\s+\(exists \(/i);
    expect(rendered.toLowerCase()).not.toContain(') or (exists (');
  });

  it('samples randomly, bounded by the requested limit', async () => {
    await service.sampleStratum({
      source: 'tp',
      stratumId: 'healed-injury',
      limit: 5,
    });

    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('tags each sampled row with the source it came from', async () => {
    const players = await service.sampleStratum({
      source: 'tp',
      stratumId: 'healed-injury',
      limit: 5,
    });

    expect(players).toEqual([{ source: 'tp', ...row }]);
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({
        source: 'bbl',
        stratumId: 'nope',
        limit: 5,
      }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
