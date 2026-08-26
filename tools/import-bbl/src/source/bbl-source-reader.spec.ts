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

type ParsedFilename = { type: string; params: Record<string, string> };

/**
 * Builds a reader wired to a mocked `BblPageService` whose `parseFilename`
 * returns canned, per-filename results from `parseResults` (or `null` for
 * any filename not listed). This keeps the collaborator's parsing algorithm
 * out of the test entirely: only the reader's own filtering/mapping/
 * iteration logic is exercised.
 */
async function makeReader(
  dir: string,
  parseResults: Record<string, ParsedFilename | null> = {},
): Promise<BblSourceReader> {
  const config = mock<SourceConfigService>();
  config.getDataDir.mockReturnValue(dir);
  const bblPage = mock<BblPageService>();
  bblPage.parseFilename.mockImplementation(
    (filename) => parseResults[filename] ?? null,
  );

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
    await writeFile(join(dir, 'file-tm-knu'), '<html></html>');
    await writeFile(join(dir, 'file-tm-vor'), '<html></html>');
    await writeFile(join(dir, 'file-pl-1'), '<html></html>');
    await writeFile(join(dir, 'file-unparseable'), '<html></html>');

    const reader = await makeReader(dir, {
      'file-tm-knu': { type: 'tm', params: { t: 'knu' } },
      'file-tm-vor': { type: 'tm', params: { t: 'vor' } },
      'file-pl-1': { type: 'pl', params: { pid: '1' } },
      'file-unparseable': null,
    });
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
    await writeFile(join(dir, 'page-file'), bytes);

    const reader = await makeReader(dir, {
      'page-file': { type: 'tm', params: { t: 'abc' } },
    });
    const [page] = await collect(reader.pages('tm'));
    const $ = page.load();

    expect($('td').text()).toContain('Göran');
    expect($('td').text()).toContain('Åke');
  });

  it('preserves 0x80-0x9F bytes as their identical code points, not Windows-1252', async () => {
    const bytes = Buffer.from([
      ...Buffer.from('<html><body><p>'),
      0x80,
      ...Buffer.from('</p></body></html>'),
    ]);
    await writeFile(join(dir, 'byte-page'), bytes);

    const reader = await makeReader(dir, {
      'byte-page': { type: 'tm', params: { t: 'abc' } },
    });
    const [page] = await collect(reader.pages('tm'));

    expect(page.load()('p').text()).toBe('');
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
    await mkdir(join(dir, 'dir-entry'));
    await writeFile(join(dir, 'file-entry'), '<html></html>');

    // Both names would parse as a matching 'tm' page; only the directory
    // entry must be excluded, and only because it isn't a file.
    const reader = await makeReader(dir, {
      'dir-entry': { type: 'tm', params: { t: 'subdir' } },
      'file-entry': { type: 'tm', params: { t: 'knu' } },
    });
    const pages = await collect(reader.pages('tm'));

    expect(pages).toHaveLength(1);
    expect(pages[0].params.t).toBe('knu');
  });
});
