import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { PageParseErrorService } from './page-parse-error.service';

describe('PageParseErrorService', () => {
  let service: PageParseErrorService;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    importResults = mock<ImportResultService>();
    // Identity field copy (`{ item, message }` in, the same out): no branching,
    // no formatting, nothing that can drift out of sync with the real
    // ImportResultService — exempt from the canned-response rule.
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        PageParseErrorService,
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(PageParseErrorService);
  });

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
