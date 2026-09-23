import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpImportResultsService } from './tp-import-results.service';

describe('TpImportResultsService', () => {
  let service: TpImportResultsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpImportResultsService],
    }).compile();
    service = moduleRef.get(TpImportResultsService);
  });

  it('builds an error from its item and message', () => {
    expect(service.error({ item: { rosterId: 7 }, message: 'boom' })).toEqual({
      item: { rosterId: 7 },
      message: 'boom',
    });
  });

  it('builds a successful result when there are no errors', () => {
    expect(service.result({ imported: 3, errors: [] })).toEqual({
      success: true,
      imported: 3,
      errors: [],
    });
  });

  it('builds a failed result when there is any error', () => {
    const errors = [{ item: 1, message: 'boom' }];
    expect(service.result({ imported: 2, errors })).toEqual({
      success: false,
      imported: 2,
      errors,
    });
  });
});
