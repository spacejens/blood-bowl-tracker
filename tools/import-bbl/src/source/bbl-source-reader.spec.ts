import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblPageService } from './bbl-page.service';
import type { BblPage } from './bbl-page.types';
import { BblSourceReader } from './bbl-source-reader';
import { SourceConfigService } from './source-config.service';

/** Mirrors BblPageService.parseFilename's real logic as a mock default. */
function parseFilename(
  filename: string,
): { type: string; params: Record<string, string> } | null {
  const prefix = 'default.asp?';
  if (!filename.startsWith(prefix)) {
    return null;
  }

  const params: Record<string, string> = {};
  let type: string | undefined;
  for (const pair of filename.slice(prefix.length).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1).normalize('NFC');
    if (key === 'p') {
      type = value;
    } else {
      params[key] = value;
    }
  }

  if (!type) {
    return null;
  }
  return { type, params };
}

async function makeReader(dir: string): Promise<BblSourceReader> {
  const config = mock<SourceConfigService>();
  config.getDataDir.mockReturnValue(dir);
  const bblPage = mock<BblPageService>();
  bblPage.parseFilename.mockImplementation(parseFilename);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblSourceReader,
      { provide: SourceConfigService, useValue: config },
      { provide: BblPageService, useValue: bblPage },
    ],
  }).compile();
  return moduleRef.get(BblSourceReader);
}

async function collect(iterable: AsyncIterable<BblPage>): Promise<BblPage[]> {
  const pages: BblPage[] = [];
  for await (const page of iterable) {
    pages.push(page);
  }
  return pages;
}

describe('BblSourceReader', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bbl-reader-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('yields only pages of the requested type', async () => {
    await writeFile(join(dir, 'default.asp?p=tm&t=knu'), '<html></html>');
    await writeFile(join(dir, 'default.asp?p=tm&t=vor'), '<html></html>');
    await writeFile(join(dir, 'default.asp?p=pl&pid=1'), '<html></html>');
    await writeFile(join(dir, 'index.html'), '<html></html>');

    const reader = await makeReader(dir);
    const pages = await collect(reader.pages('tm'));

    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.params.t).sort()).toEqual(['knu', 'vor']);
    expect(pages.every((p) => p.type === 'tm')).toBe(true);
  });

  it('decodes ISO-8859-1 bytes when loading a page', async () => {
    // 0xF6 is 'ö' and 0xE5 is 'å' in ISO-8859-1.
    const bytes = Buffer.from([
      ...Buffer.from('<html><body><table><tr><td>G'),
      0xf6,
      ...Buffer.from('ran '),
      0xc5,
      ...Buffer.from('ke</td></tr></table></body></html>'),
    ]);
    await writeFile(join(dir, 'default.asp?p=tm&t=abc'), bytes);

    const reader = await makeReader(dir);
    const [page] = await collect(reader.pages('tm'));
    const $ = page.load();

    expect($('td').text()).toContain('Göran');
    expect($('td').text()).toContain('Åke');
  });

  it('does not read the directory until iteration begins (lazy)', async () => {
    const reader = await makeReader('/no/such/bbl/dir');
    // Obtaining the iterable must not throw synchronously.
    expect(() => reader.pages('tm')).not.toThrow();
  });

  it('throws when the data directory does not exist', async () => {
    const reader = await makeReader('/no/such/bbl/dir');
    await expect(collect(reader.pages('tm'))).rejects.toThrow();
  });

  it('skips directory entries even when their name matches the page pattern', async () => {
    await mkdir(join(dir, 'default.asp?p=tm&t=subdir'));
    await writeFile(join(dir, 'default.asp?p=tm&t=knu'), '<html></html>');

    const reader = await makeReader(dir);
    const pages = await collect(reader.pages('tm'));

    expect(pages).toHaveLength(1);
    expect(pages[0].params.t).toBe('knu');
  });
});
