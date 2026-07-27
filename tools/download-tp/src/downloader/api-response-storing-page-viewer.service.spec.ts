import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { ApiResponseRecordingPageViewerResult } from './api-response-recording-page-viewer.service';
import { ApiResponseRecordingPageViewerService } from './api-response-recording-page-viewer.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';

function pageResult(
  overrides: Partial<ApiResponseRecordingPageViewerResult> = {},
): ApiResponseRecordingPageViewerResult {
  return {
    apiResponses: new Map<string, unknown>(),
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    ...overrides,
  };
}

describe('ApiResponseStoringPageViewerService', () => {
  let service: ApiResponseStoringPageViewerService;
  let recorder: MockProxy<ApiResponseRecordingPageViewerService>;
  let fileSystemService: MockProxy<FileSystemService>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    recorder = mock<ApiResponseRecordingPageViewerService>();
    fileSystemService = mock<FileSystemService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiResponseStoringPageViewerService,
        {
          provide: ApiResponseRecordingPageViewerService,
          useValue: recorder,
        },
        { provide: FileSystemService, useValue: fileSystemService },
      ],
    }).compile();
    service = moduleRef.get(ApiResponseStoringPageViewerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes every recorded response to a file and returns them', async () => {
    const apiResponses = new Map<string, unknown>([
      ['tournaments/x', { id: 'x' }],
      ['tournaments/x/news', { news: [] }],
    ]);
    recorder.viewPage.mockResolvedValue(pageResult({ apiResponses }));

    const result = await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x/news',
      dirName: 'x',
    });

    expect(recorder.viewPage).toHaveBeenCalledWith({
      pageUrl: 'https://tp.example/blood-bowl/x/news',
      clickableElements: undefined,
      followUpRequests: undefined,
    });
    expect(fileSystemService.writeJsonFile).toHaveBeenCalledWith(
      'x',
      'tournaments/x',
      { id: 'x' },
    );
    expect(fileSystemService.writeJsonFile).toHaveBeenCalledWith(
      'x',
      'tournaments/x/news',
      { news: [] },
    );
    expect(result).toBe(apiResponses);
  });

  it('passes clickable elements and follow-up requests through to the recorder', async () => {
    recorder.viewPage.mockResolvedValue(pageResult());
    const clickableElements = [{ selector: '.sel', textContent: 'Team' }];
    const followUpRequests = () => ['https://tp.example/api/phases?round=2'];

    await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x/honours',
      dirName: 'x',
      clickableElements,
      followUpRequests,
    });

    expect(recorder.viewPage).toHaveBeenCalledWith({
      pageUrl: 'https://tp.example/blood-bowl/x/honours',
      clickableElements,
      followUpRequests,
    });
  });

  it('logs console errors and warnings when there are any', async () => {
    recorder.viewPage.mockResolvedValue(
      pageResult({ consoleErrors: ['boom'], consoleWarnings: ['careful'] }),
    );

    await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
      dirName: 'x',
    });

    expect(consoleError).toHaveBeenCalledWith('Console errors: ["boom"]');
    expect(consoleError).toHaveBeenCalledWith('Console warnings: ["careful"]');
  });

  it('logs nothing when there are no console errors or warnings', async () => {
    recorder.viewPage.mockResolvedValue(pageResult());

    await service.viewPage({
      pageUrl: 'https://tp.example/blood-bowl/x',
      dirName: 'x',
    });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('throws and writes nothing when the page reported errors', async () => {
    recorder.viewPage.mockResolvedValue(
      pageResult({
        apiResponses: new Map<string, unknown>([['a', 1]]),
        pageErrors: ['page exploded'],
      }),
    );

    await expect(
      service.viewPage({
        pageUrl: 'https://tp.example/blood-bowl/x',
        dirName: 'x',
      }),
    ).rejects.toThrow('Failed to view https://tp.example/blood-bowl/x');
    expect(consoleError).toHaveBeenCalledWith('Page errors: ["page exploded"]');
    expect(fileSystemService.writeJsonFile).not.toHaveBeenCalled();
  });
});
