import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { SppAdjustmentsImportService } from './spp-adjustments-import.service';
import type { ImportError } from './types';

describe('SppAdjustmentsImportService', () => {
  let service: SppAdjustmentsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;
  let errors: ImportError[];

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppAdjustmentsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(SppAdjustmentsImportService);
  });

  it('passes the scraped-adjustment payload through to the client', async () => {
    client.players.syncScrapedSppAdjustments.mockResolvedValue({
      updatedPlayerIds: [1],
    });
    const data = { players: [{ playerId: 1, scrapedTotal: 16 }] };

    const result = await service.syncScrapedSppAdjustments(data, errors);

    expect(result).toEqual({ updatedPlayerIds: [1] });
    expect(client.players.syncScrapedSppAdjustments).toHaveBeenCalledWith(data);
    expect(errors).toEqual([]);
  });

  it('records a non-fatal error when the scraped sync call fails', async () => {
    client.players.syncScrapedSppAdjustments.mockRejectedValue(
      new Error('boom'),
    );

    const result = await service.syncScrapedSppAdjustments(
      { players: [{ playerId: 1, scrapedTotal: null }] },
      errors,
    );

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('1 player(s)');
    expect(errors[0].message).toContain('boom');
  });

  it('stringifies a non-Error rejection from the scraped sync call', async () => {
    client.players.syncScrapedSppAdjustments.mockRejectedValue('nope');

    await service.syncScrapedSppAdjustments(
      { players: [{ playerId: 1, scrapedTotal: 16 }] },
      errors,
    );

    expect(errors[0].message).toContain('nope');
  });

  it('passes the reported-adjustment payload through to the client', async () => {
    client.players.syncReportedSppAdjustments.mockResolvedValue({
      updatedPlayerIds: [2],
    });
    const data = { playerIds: [2] };

    const result = await service.syncReportedSppAdjustments(data, errors);

    expect(result).toEqual({ updatedPlayerIds: [2] });
    expect(client.players.syncReportedSppAdjustments).toHaveBeenCalledWith(
      data,
    );
  });

  it('stringifies a non-Error rejection from the reported sync call', async () => {
    client.players.syncReportedSppAdjustments.mockRejectedValue('nope');

    await service.syncReportedSppAdjustments({ playerIds: [2] }, errors);

    expect(errors[0].message).toContain('nope');
  });

  it('records an error when the reported sync call fails', async () => {
    client.players.syncReportedSppAdjustments.mockRejectedValue(
      new Error('fail'),
    );

    const result = await service.syncReportedSppAdjustments(
      { playerIds: [3, 4] },
      errors,
    );

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2 player(s)');
    expect(errors[0].message).toContain('fail');
  });
});
