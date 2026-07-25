import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BblPageService } from './bbl-page.service';

describe('BblPageService', () => {
  let service: BblPageService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BblPageService],
    }).compile();
    service = moduleRef.get(BblPageService);
  });

  it('parses a team page filename into type and params', () => {
    expect(service.parseFilename('default.asp?p=tm&t=knu')).toEqual({
      type: 'tm',
      params: { t: 'knu' },
    });
  });

  it('parses a filename with multiple params', () => {
    expect(service.parseFilename('default.asp?p=mp&act=inj&pid=1489')).toEqual({
      type: 'mp',
      params: { act: 'inj', pid: '1489' },
    });
  });

  it('returns null when the file is not a BBL page', () => {
    expect(service.parseFilename('index.html')).toBeNull();
    expect(
      service.parseFilename('wget-output-20230802105338-1.log'),
    ).toBeNull();
  });

  it('returns null when there is no p= param', () => {
    expect(service.parseFilename('default.asp?foo=bar')).toBeNull();
  });

  it('returns null for filenames without a query string', () => {
    expect(service.parseFilename('default.asp')).toBeNull();
  });

  it('returns null for filenames with a similar but inexact prefix', () => {
    expect(service.parseFilename('default.aspx?p=tm')).toBeNull();
  });

  it('skips query segments that have no = sign', () => {
    expect(service.parseFilename('default.asp?p=tm&broken&t=knu')).toEqual({
      type: 'tm',
      params: { t: 'knu' },
    });
  });

  it('normalizes param values to NFC (some filesystems, e.g. macOS APFS, return NFD-decomposed filenames while page content decodes to NFC)', () => {
    // "a" (U+0061) + COMBINING RING ABOVE (U+030A) -- the decomposed form
    const nfdA = 'å';
    // LATIN SMALL LETTER A WITH RING ABOVE (U+00E5) -- the precomposed form
    const nfcA = 'å';
    expect(nfdA).not.toBe(nfcA);
    expect(nfdA.normalize('NFC')).toBe(nfcA);

    const parsed = service.parseFilename(`default.asp?p=tm&t=g${nfdA}s`);
    expect(parsed?.params.t).toBe(`g${nfcA}s`);
  });
});
