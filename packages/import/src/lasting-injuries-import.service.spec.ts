import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { LastingInjuriesImportService } from './lasting-injuries-import.service';
import type { ImportError } from './types';

describe('LastingInjuriesImportService', () => {
  let service: LastingInjuriesImportService;
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
        LastingInjuriesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(LastingInjuriesImportService);
  });

  it('forwards the player ids and returns the result', async () => {
    client.players.syncLastingInjuryHistory.mockResolvedValue({
      backfilledPlayerIds: [7],
    });

    const result = await service.syncLastingInjuryHistory(
      { playerIds: [7, 8] },
      errors,
    );

    expect(client.players.syncLastingInjuryHistory).toHaveBeenCalledWith({
      playerIds: [7, 8],
    });
    expect(result).toEqual({ backfilledPlayerIds: [7] });
    expect(errors).toEqual([]);
  });

  it('records a non-fatal error naming the batch size when the call fails', async () => {
    client.players.syncLastingInjuryHistory.mockRejectedValue(
      new Error('boom'),
    );

    const result = await service.syncLastingInjuryHistory(
      { playerIds: [7, 8] },
      errors,
    );

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2 player(s)');
    expect(errors[0].message).toContain('boom');
  });

  it('stringifies a non-Error rejection from the call', async () => {
    client.players.syncLastingInjuryHistory.mockRejectedValue('nope');

    await service.syncLastingInjuryHistory({ playerIds: [7] }, errors);

    expect(errors[0].message).toContain('nope');
  });
});
