import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import type { TpRequest } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';

const REQUEST: TpRequest = {
  path: 'tournament/s30/news',
  url: 'https://tp.example/api/tournament/s30/news',
  referer: 'https://tp.example/blood-bowl/s30/news',
};

describe('ApiResponseStoringService', () => {
  let service: ApiResponseStoringService;
  let fileSystemService: MockProxy<FileSystemService>;
  let session: MockProxy<TpFetchSession>;

  beforeEach(async () => {
    fileSystemService = mock<FileSystemService>();
    session = mock<TpFetchSession>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiResponseStoringService,
        { provide: FileSystemService, useValue: fileSystemService },
      ],
    }).compile();
    service = moduleRef.get(ApiResponseStoringService);
  });

  it("fetches the request's URL with its referer", async () => {
    session.fetch.mockResolvedValue({});

    await service.fetchAndStore(session, REQUEST, 's30');

    expect(session.fetch).toHaveBeenCalledWith(
      'https://tp.example/api/tournament/s30/news',
      { referer: 'https://tp.example/blood-bowl/s30/news' },
    );
  });

  it('writes the response to the file named after its API path, and returns it', async () => {
    session.fetch.mockResolvedValue({ id: 1 });

    await expect(
      service.fetchAndStore(session, REQUEST, 's30'),
    ).resolves.toEqual({ id: 1 });
    expect(fileSystemService.writeJsonFile).toHaveBeenCalledWith(
      's30',
      'tournament/s30/news',
      { id: 1 },
    );
  });

  it('writes nothing when the request fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    await expect(
      service.fetchAndStore(session, REQUEST, 's30'),
    ).rejects.toThrow('status 403');
    expect(fileSystemService.writeJsonFile).not.toHaveBeenCalled();
  });
});
