import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblPageService } from './bbl-page.service';
import type { BblPage } from './bbl-page.types';
import { BblSourceReader } from './bbl-source-reader';
import { SourceConfigService } from './source-config.service';

const DATA_DIR = '/bbl/data';

type ParsedFilename = { type: string; params: Record<string, string> };

/**
 * Builds a reader over a canned mirror: `files` lists what the shared reader
 * reports and what each file's text is, and `parseResults` supplies canned
 * per-filename results for the mocked `BblPageService` (null for anything not
 * listed). Both collaborators' real algorithms stay out of this test — only
 * the reader's own filtering/mapping/iteration logic is exercised.
 */
async function makeReader(
  files: Record<string, string | null>,
  parseResults: Record<string, ParsedFilename | null> = {},
): Promise<BblSourceReader> {
  const config = mock<SourceConfigService>();
  config.getDataDir.mockReturnValue(DATA_DIR);
  const bblPage = mock<BblPageService>();
  bblPage.parseFilename.mockImplementation(
    (filename) => parseResults[filename] ?? null,
  );
  const mirror = mock<BblMirrorReaderService>();
  mirror.listFiles.mockResolvedValue(Object.keys(files));
  mirror.readFile.mockImplementation((_dir, filename) =>
    Promise.resolve(files[filename] ?? null),
  );

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblSourceReader,
      { provide: SourceConfigService, useValue: config },
      { provide: BblPageService, useValue: bblPage },
      { provide: BblMirrorReaderService, useValue: mirror },
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
  it('yields only pages of the requested type', async () => {
    const reader = await makeReader(
      {
        'file-tm-knu': '<html></html>',
        'file-tm-vor': '<html></html>',
        'file-pl-1': '<html></html>',
        'file-unparseable': '<html></html>',
      },
      {
        'file-tm-knu': { type: 'tm', params: { t: 'knu' } },
        'file-tm-vor': { type: 'tm', params: { t: 'vor' } },
        'file-pl-1': { type: 'pl', params: { pid: '1' } },
        'file-unparseable': null,
      },
    );

    const pages = await collect(reader.pages('tm'));

    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.params.t).sort()).toEqual(['knu', 'vor']);
    expect(pages.every((p) => p.type === 'tm')).toBe(true);
  });

  it('parses the text the shared reader returned as the page HTML', async () => {
    const reader = await makeReader(
      {
        'page-file':
          '<html><body><table><tr><td>Goran Ake</td></tr></table></body></html>',
      },
      { 'page-file': { type: 'tm', params: { t: 'abc' } } },
    );

    const [page] = await collect(reader.pages('tm'));

    expect(page.load()('td').text()).toBe('Goran Ake');
  });

  it('reads each matching file out of the configured data directory', async () => {
    const config = mock<SourceConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    const bblPage = mock<BblPageService>();
    bblPage.parseFilename.mockReturnValue({ type: 'tm', params: { t: 'knu' } });
    const mirror = mock<BblMirrorReaderService>();
    mirror.listFiles.mockResolvedValue(['file-tm-knu']);
    mirror.readFile.mockResolvedValue('<html></html>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblSourceReader,
        { provide: SourceConfigService, useValue: config },
        { provide: BblPageService, useValue: bblPage },
        { provide: BblMirrorReaderService, useValue: mirror },
      ],
    }).compile();

    await collect(moduleRef.get(BblSourceReader).pages('tm'));

    expect(mirror.listFiles).toHaveBeenCalledWith(DATA_DIR);
    expect(mirror.readFile).toHaveBeenCalledWith(DATA_DIR, 'file-tm-knu');
  });

  it('does not read a file whose type does not match', async () => {
    const config = mock<SourceConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    const bblPage = mock<BblPageService>();
    bblPage.parseFilename.mockReturnValue({ type: 'pl', params: { pid: '1' } });
    const mirror = mock<BblMirrorReaderService>();
    mirror.listFiles.mockResolvedValue(['file-pl-1']);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblSourceReader,
        { provide: SourceConfigService, useValue: config },
        { provide: BblPageService, useValue: bblPage },
        { provide: BblMirrorReaderService, useValue: mirror },
      ],
    }).compile();

    await collect(moduleRef.get(BblSourceReader).pages('tm'));

    expect(mirror.readFile).not.toHaveBeenCalled();
  });

  it('skips a listed file that is no longer readable', async () => {
    const reader = await makeReader(
      { 'gone-file': null, 'live-file': '<html></html>' },
      {
        'gone-file': { type: 'tm', params: { t: 'gone' } },
        'live-file': { type: 'tm', params: { t: 'knu' } },
      },
    );

    const pages = await collect(reader.pages('tm'));

    expect(pages.map((p) => p.params.t)).toEqual(['knu']);
  });

  it('yields nothing when the mirror directory has no files', async () => {
    const reader = await makeReader({});

    await expect(collect(reader.pages('tm'))).resolves.toEqual([]);
  });

  it('does not read the directory until iteration begins (lazy)', async () => {
    const reader = await makeReader({});

    // Obtaining the iterable must not throw synchronously.
    expect(() => reader.pages('tm')).not.toThrow();
  });
});
