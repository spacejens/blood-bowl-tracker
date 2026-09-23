import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { ExternalSystem } from '@blood-bowl-tracker/db';
import {
  ErasService,
  ExternalSystemsService,
  RulesSetsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import {
  ERA_ID,
  NAME_SYSTEM_ID,
  RULES_SET,
  TP_SYSTEM_ID,
  tpRoster,
} from './tp-roster.test-helpers';
import { TpRosterContextService } from './tp-roster-context.service';

describe('TpRosterContextService', () => {
  let service: TpRosterContextService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let eras: MockProxy<ErasService>;
  let rulesSets: MockProxy<RulesSetsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    eras = mock<ErasService>();
    rulesSets = mock<RulesSetsService>();
    errors = [];
    externalSystems.upsert
      .mockResolvedValueOnce({
        system: mock<ExternalSystem>({ id: TP_SYSTEM_ID }),
        created: false,
      })
      .mockResolvedValueOnce({
        system: mock<ExternalSystem>({ id: NAME_SYSTEM_ID }),
        created: false,
      });
    eras.resolve.mockResolvedValue({ found: true, id: ERA_ID });
    rulesSets.listByEra.mockResolvedValue([RULES_SET]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterContextService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: ErasService, useValue: eras },
        { provide: RulesSetsService, useValue: rulesSets },
      ],
    }).compile();
    service = moduleRef.get(TpRosterContextService);
  });

  const resolve = () =>
    service.resolve({
      roster: tpRoster(),
      era: 'Fourth era',
      externalSystemName: 'TP',
      errors,
    });

  it('resolves both external systems, the era and its single rules set', async () => {
    await expect(resolve()).resolves.toEqual({
      tpSystemId: TP_SYSTEM_ID,
      nameSystemId: NAME_SYSTEM_ID,
      era: { id: ERA_ID, name: 'Fourth era' },
      rulesSet: RULES_SET,
    });
    expect(externalSystems.upsert).toHaveBeenNthCalledWith(1, {
      name: 'TP',
      category: 'imported_data_source',
    });
    expect(externalSystems.upsert).toHaveBeenNthCalledWith(2, {
      name: 'Name',
      category: 'bookkeeping',
    });
    expect(eras.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'Fourth era',
    });
    expect(rulesSets.listByEra).toHaveBeenCalledWith(ERA_ID);
    expect(errors).toEqual([]);
  });

  it('uses the external system name it is given', async () => {
    await service.resolve({
      roster: tpRoster(),
      era: 'Fourth era',
      externalSystemName: 'TP-test',
      errors,
    });

    expect(externalSystems.upsert).toHaveBeenNthCalledWith(1, {
      name: 'TP-test',
      category: 'imported_data_source',
    });
  });

  it('records one error and resolves nothing when an external system cannot be set up', async () => {
    externalSystems.upsert.mockReset();
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { externalSystems: ['TP', 'Name'] }, message: 'db down' },
    ]);
  });

  it('records one error and resolves nothing for an era not in the database', async () => {
    eras.resolve.mockResolvedValue({ found: false });

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { era: 'Fourth era', roster: 163386 },
        message:
          'Unknown era "Fourth era" for roster 163386: not found among imported eras.',
      },
    ]);
  });

  it.each([
    [[], 'declares 0 rules sets ()'],
    [
      [RULES_SET, { ...RULES_SET, id: 901, name: 'BB2025' }],
      'declares 2 rules sets (BB2020, BB2025)',
    ],
  ])(
    'records one error and resolves no rules set for an era declaring %j',
    async (declared, wording) => {
      rulesSets.listByEra.mockResolvedValue(declared);

      const context = await resolve();

      expect(context?.rulesSet).toBeUndefined();
      expect(context?.era).toEqual({ id: ERA_ID, name: 'Fourth era' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(
        `Era "Fourth era" ${wording}; characteristics need exactly one, so they are skipped for every roster in this era.`,
      );
    },
  );
});
