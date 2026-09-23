import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { FileSystemService } from './file-system.service';

/** One API response to download and keep. */
export type StoredApiRequest = {
  /**
   * API path relative to `connection.backendApiUrl`, query string included.
   * Also names the output file (slashes become underscores), which is the
   * layout tools/import-tp reads.
   */
  path: string;
  /** The TP frontend page URL this request belongs to. */
  referer: string;
  /** Output folder under `data/`. */
  dirName: string;
};

@Injectable()
export class ApiResponseStoringService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  /**
   * Requests one API path through the given session and writes the response
   * to its JSON file. Returns the response so the caller can find further
   * paths to request in it. A failed request writes nothing.
   */
  async fetchAndStore(
    session: TpFetchSession,
    request: StoredApiRequest,
  ): Promise<unknown> {
    const { path, referer, dirName } = request;
    const body = await session.fetch(
      this.downloadTpConfigService.getBackendApiUrl() + path,
      { referer },
    );
    this.fileSystemService.writeJsonFile(dirName, path, body);
    return body;
  }
}
