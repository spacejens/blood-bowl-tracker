import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { SourceConfigService } from './source-config.service';
import { parsePageFilename } from './bbl-page';
import type { BblPage } from './bbl-page';

@Injectable()
export class BblSourceReader {
  constructor(private readonly config: SourceConfigService) {}

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
      const parsed = parsePageFilename(entry.name);
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
