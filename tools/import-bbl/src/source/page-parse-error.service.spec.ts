import { ImportResultService } from '@blood-bowl-tracker/import';
import { describe, expect, it } from 'vitest';

import { PageParseErrorService } from './page-parse-error.service';

describe('PageParseErrorService', () => {
  const service = new PageParseErrorService(new ImportResultService());

  it('records the page params and the error message', () => {
    expect(
      service.build({ p: 'pt', t: '3' }, 'position', new Error('bad html')),
    ).toEqual({
      item: { page: { p: 'pt', t: '3' } },
      message: 'Failed to parse position page {"p":"pt","t":"3"}: bad html',
    });
  });

  it('stringifies a non-Error throw', () => {
    expect(service.build({ p: 'tm' }, 'team', 'weird')).toEqual({
      item: { page: { p: 'tm' } },
      message: 'Failed to parse team page {"p":"tm"}: weird',
    });
  });
});
