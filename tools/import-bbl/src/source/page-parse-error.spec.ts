import { describe, expect, it } from 'vitest';

import { pageParseError } from './page-parse-error';

describe('pageParseError', () => {
  it('records the page params and the error message', () => {
    expect(
      pageParseError({ p: 'pt', t: '3' }, 'position', new Error('bad html')),
    ).toEqual({
      item: { page: { p: 'pt', t: '3' } },
      message: 'Failed to parse position page {"p":"pt","t":"3"}: bad html',
    });
  });

  it('stringifies a non-Error throw', () => {
    expect(pageParseError({ p: 'tm' }, 'team', 'weird')).toEqual({
      item: { page: { p: 'tm' } },
      message: 'Failed to parse team page {"p":"tm"}: weird',
    });
  });
});
