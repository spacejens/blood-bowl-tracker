import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { StarPlayerLookupService } from './star-player-lookup.service';

async function makeService(dbResult: MockDbResult): Promise<{
  service: StarPlayerLookupService;
  externalSystems: ReturnType<typeof mock<ExternalSystemLookupService>>;
}> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return {
    service: moduleRef.get(StarPlayerLookupService),
    externalSystems,
  };
}

describe('StarPlayerLookupService', () => {
  it('issues no query for an empty id list', async () => {
    const dbResult = mockDb();
    const { service } = await makeService(dbResult);

    expect(await service.findByExternalIds('bbl', [])).toEqual([]);
    expect(dbResult.chains).toHaveLength(0);
  });

  it('resolves a BBL lookup by matching the typID half of the stored id', async () => {
    const dbResult = mockDb([
      { positionId: 7, positionName: 'Bomber Dribbler' },
    ]);
    const { service, externalSystems } = await makeService(dbResult);

    expect(await service.findByExternalIds('bbl', ['126'])).toEqual([
      { positionId: 7, positionName: 'Bomber Dribbler' },
    ]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('bbl');

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('split_part');
    expect(query.params).toContain('126');
  });

  it('resolves a TP lookup by matching the external id exactly', async () => {
    const dbResult = mockDb([
      { positionId: 8, positionName: 'Eldril Sidewinder' },
    ]);
    const { service, externalSystems } = await makeService(dbResult);

    expect(
      await service.findByExternalIds('tp', ['Eldril Sidewinder']),
    ).toEqual([{ positionId: 8, positionName: 'Eldril Sidewinder' }]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).not.toContain('split_part');
    expect(query.params).toContain('Eldril Sidewinder');
  });

  it('resolves a manual lookup by lowercased name, without touching external systems', async () => {
    const dbResult = mockDb([
      { positionId: 9, positionName: 'Griff Oberwald' },
    ]);
    const { service, externalSystems } = await makeService(dbResult);

    expect(
      await service.findByExternalIds('manual', ['Griff Oberwald']),
    ).toEqual([{ positionId: 9, positionName: 'Griff Oberwald' }]);
    expect(externalSystems.getSystemId).not.toHaveBeenCalled();

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('lower(');
    expect(query.params).toContain('griff oberwald');
  });

  it('filters every query on is_star_player', async () => {
    const bblResult = mockDb([]);
    const { service: bblService } = await makeService(bblResult);
    await bblService.findByExternalIds('bbl', ['126']);
    const bblCondition = bblResult.chains[0].where.mock.calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(bblCondition).sql).toContain(
      'is_star_player',
    );

    const manualResult = mockDb([]);
    const { service: manualService } = await makeService(manualResult);
    await manualService.findByExternalIds('manual', ['Griff']);
    const manualCondition = manualResult.chains[0].where.mock
      .calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(manualCondition).sql).toContain(
      'is_star_player',
    );
  });
});
