import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  ) {}

  /**
   * Stream every source page of the given type. Files are read, decoded from
   * ISO-8859-1, and yielded one at a time so only a single page is held in
   * memory at once. `load()` parses the page's HTML on demand.
   */
  async *pages(type: string): AsyncIterable<BblPage> {
    const dir = this.config.getDataDir();
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const parsed = this.bblPage.parseFilename(entry.name);
      if (!parsed || parsed.type !== type) {
        continue;
      }
      const buffer = await readFile(join(dir, entry.name));
      // ISO-8859-1 maps every byte to a code point, so decoding never throws
      // on the mirror's stray/extended-ASCII bytes.
      const html = new TextDecoder('latin1').decode(buffer);
      yield {
        type: parsed.type,
        params: parsed.params,
        load: () => load(html),
      };
    }
  }
}
