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
  NAME_SYSTEM_ID,
  RULES_SET_ID,
  TP_SYSTEM_ID,
} from './tp-official-teams.test-helpers';
import { TpOfficialTeamsContextService } from './tp-official-teams-context.service';

describe('TpOfficialTeamsContextService', () => {
  let service: TpOfficialTeamsContextService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let rulesSets: MockProxy<RulesSetsService>;
  let eras: MockProxy<ErasService>;
  let errors: ImportError[];

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    rulesSets = mock<RulesSetsService>();
    eras = mock<ErasService>();
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
    rulesSets.resolve.mockResolvedValue({ found: true, id: RULES_SET_ID });
    eras.listByRulesSetAndExternalSystem.mockResolvedValue([
      { id: 40, name: 'Fourth era' },
      { id: 41, name: 'Fifth era' },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialTeamsContextService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: RulesSetsService, useValue: rulesSets },
        { provide: ErasService, useValue: eras },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsContextService);
  });

  const resolve = () =>
    service.resolve({ rulesSet: 'BB2020', externalSystemName: 'TP', errors });

  it('resolves both external systems, the rules set and its TP eras', async () => {
    await expect(resolve()).resolves.toEqual({
      tpSystemId: TP_SYSTEM_ID,
      nameSystemId: NAME_SYSTEM_ID,
      rulesSet: 'BB2020',
      rulesSetId: RULES_SET_ID,
      eraIds: [40, 41],
    });
    expect(externalSystems.upsert).toHaveBeenNthCalledWith(1, {
      name: 'TP',
      category: 'imported_data_source',
    });
    expect(externalSystems.upsert).toHaveBeenNthCalledWith(2, {
      name: 'Name',
      category: 'bookkeeping',
    });
    expect(rulesSets.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'BB2020',
    });
    expect(eras.listByRulesSetAndExternalSystem).toHaveBeenCalledWith({
      rulesSetId: RULES_SET_ID,
      externalSystemId: TP_SYSTEM_ID,
    });
    expect(errors).toEqual([]);
  });

  it('records one error and resolves nothing when the external systems fail', async () => {
    externalSystems.upsert.mockReset();
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { externalSystems: ['TP', 'Name'] }, message: 'db down' },
    ]);
    expect(rulesSets.resolve).not.toHaveBeenCalled();
  });

  it('records one error and resolves nothing for an unknown rules set', async () => {
    rulesSets.resolve.mockResolvedValue({ found: false });

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2020' },
        message:
          'Skipping TP\'s official team list for rules set "BB2020": the rules set has not been imported.',
      },
    ]);
    expect(eras.listByRulesSetAndExternalSystem).not.toHaveBeenCalled();
  });

  it('records one error but still resolves when no TP era declares the rules set', async () => {
    eras.listByRulesSetAndExternalSystem.mockResolvedValue([]);

    await expect(resolve()).resolves.toMatchObject({ eraIds: [] });
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2020' },
        message:
          'Rules set "BB2020" is declared by no era imported from TP; its races and positions are imported without era availability.',
      },
    ]);
  });

  it('records one error and resolves nothing when the eras cannot be read', async () => {
    eras.listByRulesSetAndExternalSystem.mockRejectedValue(new Error('boom'));

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2020' },
        message: 'Failed to read the eras of rules set "BB2020": boom',
      },
    ]);
  });
});
