import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import type { TpRequest } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { FileSystemService } from './file-system.service';

@Injectable()
export class ApiResponseStoringService {
  constructor(private readonly fileSystemService: FileSystemService) {}

  /**
   * Makes one TP request through the given session and writes the response
   * to `dirName` (under `data/`), in the file named after the request's API
   * path (slashes become underscores, the layout tools/import-tp reads).
   * Returns the response so the caller can find further requests to make in
   * it. A failed request writes nothing.
   */
  async fetchAndStore(
    session: TpFetchSession,
    request: TpRequest,
    dirName: string,
  ): Promise<unknown> {
    const body = await session.fetch(request.url, {
      referer: request.referer,
    });
    this.fileSystemService.writeJsonFile(dirName, request.path, body);
    return body;
  }
}
