import { describe, it, expect } from 'vitest';
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
});
