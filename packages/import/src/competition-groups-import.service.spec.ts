import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { CompetitionGroupsImportService } from './competition-groups-import.service';
import { ImportRunnerService } from './import-runner.service';

describe('CompetitionGroupsImportService', () => {
  let service: CompetitionGroupsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionGroupsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(CompetitionGroupsImportService);
  });

  const data = {
    name: 'Chaos Cup',
    leagueId: 1,
    externalIds: [{ externalSystemId: 2, externalId: 'Chaos Cup' }],
  };

  it('delegates the upsert to the import runner', async () => {
    runner.recordUpsertResult.mockResolvedValue({ id: 5 });

    await expect(service.upsertCompetitionGroup(data, [])).resolves.toEqual({
      id: 5,
    });
    expect(runner.recordUpsertResult).toHaveBeenCalledWith(
      expect.objectContaining({ item: data }),
    );
  });

  it('builds an error message naming the group', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertCompetitionGroup(data, []);

    const [options] = runner.recordUpsertResult.mock.calls[0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import competition group "Chaos Cup": boom',
    );
  });

  it('calls the API client competitionGroups.upsert procedure', async () => {
    runner.recordUpsertResult.mockResolvedValue({ id: 5 });

    await service.upsertCompetitionGroup(data, []);

    const [options] = runner.recordUpsertResult.mock.calls[0];
    await options.upsert();
    expect(client.competitionGroups.upsert).toHaveBeenCalledWith(data);
  });
});
