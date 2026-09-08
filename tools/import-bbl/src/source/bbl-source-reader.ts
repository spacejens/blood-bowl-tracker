import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';

import { BblPageService } from './bbl-page.service';
import type { BblPage } from './bbl-page.types';
import { SourceConfigService } from './source-config.service';

@Injectable()
export class BblSourceReader {
  constructor(
    private readonly config: SourceConfigService,
    private readonly bblPage: BblPageService,
    private readonly mirror: BblMirrorReaderService,
  ) {}

  /**
   * Stream every source page of the given type. Files are read and decoded by
   * the shared mirror reader and yielded one at a time so only a single page
   * is held in memory at once. `load()` parses the page's HTML on demand.
   */
  async *pages(type: string): AsyncIterable<BblPage> {
    const dir = this.config.getDataDir();
    for (const filename of await this.mirror.listFiles(dir)) {
      const parsed = this.bblPage.parseFilename(filename);
      if (!parsed || parsed.type !== type) {
        continue;
      }
      const html = await this.mirror.readFile(dir, filename);
      if (html === null) {
        // Listed a moment ago but unreadable now — nothing to yield.
        continue;
      }
      yield {
        type: parsed.type,
        params: parsed.params,
        load: () => load(html),
      };
    }
  }
}
