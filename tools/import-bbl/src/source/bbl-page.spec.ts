import { describe, expect, it } from 'vitest';

import { parsePageFilename } from './bbl-page';

describe('parsePageFilename', () => {
  it('parses a team page filename into type and params', () => {
    expect(parsePageFilename('default.asp?p=tm&t=knu')).toEqual({
      type: 'tm',
      params: { t: 'knu' },
    });
  });

  it('parses a filename with multiple params', () => {
    expect(parsePageFilename('default.asp?p=mp&act=inj&pid=1489')).toEqual({
      type: 'mp',
      params: { act: 'inj', pid: '1489' },
    });
  });

  it('returns null when the file is not a BBL page', () => {
    expect(parsePageFilename('index.html')).toBeNull();
    expect(parsePageFilename('wget-output-20230802105338-1.log')).toBeNull();
  });

  it('returns null when there is no p= param', () => {
    expect(parsePageFilename('default.asp?foo=bar')).toBeNull();
  });

  it('returns null for filenames without a query string', () => {
    expect(parsePageFilename('default.asp')).toBeNull();
  });

  it('returns null for filenames with a similar but inexact prefix', () => {
    expect(parsePageFilename('default.aspx?p=tm')).toBeNull();
  });

  it('skips query segments that have no = sign', () => {
    expect(parsePageFilename('default.asp?p=tm&broken&t=knu')).toEqual({
      type: 'tm',
      params: { t: 'knu' },
    });
  });

  it('normalizes param values to NFC (some filesystems, e.g. macOS APFS, return NFD-decomposed filenames while page content decodes to NFC)', () => {
    // "a" (U+0061) + COMBINING RING ABOVE (U+030A) -- the decomposed form
    const nfdA = '\u0061\u030A';
    // LATIN SMALL LETTER A WITH RING ABOVE (U+00E5) -- the precomposed form
    const nfcA = '\u00E5';
    expect(nfdA).not.toBe(nfcA);
    expect(nfdA.normalize('NFC')).toBe(nfcA);

    const parsed = parsePageFilename(`default.asp?p=tm&t=g${nfdA}s`);
    expect(parsed?.params.t).toBe(`g${nfcA}s`);
  });
});
