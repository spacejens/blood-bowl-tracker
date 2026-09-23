import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';

const REQUEST = {
  path: 'tournament/s30/news',
  referer: 'https://tp.example/blood-bowl/s30/news',
  dirName: 's30',
};

describe('ApiResponseStoringService', () => {
  let service: ApiResponseStoringService;
  let configService: MockProxy<DownloadTpConfigService>;
  let fileSystemService: MockProxy<FileSystemService>;
  let session: MockProxy<TpFetchSession>;

  beforeEach(async () => {
    configService = mock<DownloadTpConfigService>();
    configService.getBackendApiUrl.mockReturnValue('https://tp.example/api/');
    fileSystemService = mock<FileSystemService>();
    session = mock<TpFetchSession>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiResponseStoringService,
        { provide: DownloadTpConfigService, useValue: configService },
        { provide: FileSystemService, useValue: fileSystemService },
      ],
    }).compile();
    service = moduleRef.get(ApiResponseStoringService);
  });

  it('fetches the path under the backend API URL, with the given referer', async () => {
    session.fetch.mockResolvedValue({});

    await service.fetchAndStore(session, REQUEST);

    expect(session.fetch).toHaveBeenCalledWith(
      'https://tp.example/api/tournament/s30/news',
      { referer: 'https://tp.example/blood-bowl/s30/news' },
    );
  });

  it('writes the response to the file named after its API path, and returns it', async () => {
    session.fetch.mockResolvedValue({ id: 1 });

    await expect(service.fetchAndStore(session, REQUEST)).resolves.toEqual({
      id: 1,
    });
    expect(fileSystemService.writeJsonFile).toHaveBeenCalledWith(
      's30',
      'tournament/s30/news',
      { id: 1 },
    );
  });

  it('writes nothing when the request fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    await expect(service.fetchAndStore(session, REQUEST)).rejects.toThrow(
      'status 403',
    );
    expect(fileSystemService.writeJsonFile).not.toHaveBeenCalled();
  });
});
