import { Injectable } from '@nestjs/common';

import type {
  ApiResponseFollowUpRequestResolver,
  ApiResponseRecordingPageViewerClickableElement,
} from './api-response-recording-page-viewer.service';
import { ApiResponseRecordingPageViewerService } from './api-response-recording-page-viewer.service';
import { FileSystemService } from './file-system.service';

export type ApiResponseStoringPageViewerOptions = {
  pageUrl: string;
  dirName: string;
  clickableElements?: ApiResponseRecordingPageViewerClickableElement[];
  followUpRequests?: ApiResponseFollowUpRequestResolver;
};

@Injectable()
export class ApiResponseStoringPageViewerService {
  constructor(
    private readonly apiResponseRecordingPageViewerService: ApiResponseRecordingPageViewerService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  async viewPage(
    options: ApiResponseStoringPageViewerOptions,
  ): Promise<Map<string, unknown>> {
    const { pageUrl, dirName, clickableElements, followUpRequests } = options;
    const pageResult =
      await this.apiResponseRecordingPageViewerService.viewPage({
        pageUrl,
        clickableElements,
        followUpRequests,
      });
    // Print console errors or warnings if there were any
    if (pageResult.consoleErrors.length > 0) {
      console.error(
        `Console errors: ${JSON.stringify(pageResult.consoleErrors)}`,
      );
    }
    if (pageResult.consoleWarnings.length > 0) {
      console.error(
        `Console warnings: ${JSON.stringify(pageResult.consoleWarnings)}`,
      );
    }
    // Terminate if there were page errors
    if (pageResult.pageErrors.length > 0) {
      console.error(`Page errors: ${JSON.stringify(pageResult.pageErrors)}`);
      throw new Error(`Failed to view ${pageUrl}`);
    }
    // Store the responses in files
    pageResult.apiResponses.forEach((response, requestUrl) => {
      this.fileSystemService.writeJsonFile(dirName, requestUrl, response);
    });
    // Return the responses
    return pageResult.apiResponses;
  }
}
