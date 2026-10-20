import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImportResultService } from './import-result.service';

describe('ImportResultService', () => {
  let service: ImportResultService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ImportResultService],
    }).compile();
    service = moduleRef.get(ImportResultService);
  });

  describe('error', () => {
    it('copies the item and message', () => {
      expect(
        service.error({ item: { id: 1 }, message: 'Unknown team' }),
      ).toEqual({ item: { id: 1 }, message: 'Unknown team' });
    });
  });

  describe('result', () => {
    it('creates a successful result', () => {
      const result = service.result({ imported: 5, errors: [] });
      expect(result).toEqual({ success: true, imported: 5, errors: [] });
    });

    it('creates a failed result when errors are present', () => {
      const error = service.error({ item: { id: 1 }, message: 'Unknown team' });
      const result = service.result({ imported: 0, errors: [error] });
      expect(result.success).toBe(false);
      expect(result.errors).toEqual([error]);
    });
  });
});
