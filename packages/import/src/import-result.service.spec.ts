import { describe, expect, it } from 'vitest';

import { ImportResultService } from './import-result.service';

describe('ImportResultService', () => {
  describe('result', () => {
    it('creates a successful result', () => {
      const service = new ImportResultService();
      const result = service.result({ imported: 5, errors: [] });
      expect(result.success).toBe(true);
      expect(result.imported).toBe(5);
      expect(result.errors).toHaveLength(0);
    });

    it('creates a failed result when errors are present', () => {
      const service = new ImportResultService();
      const error = service.error({ item: { id: 1 }, message: 'Unknown team' });
      const result = service.result({ imported: 0, errors: [error] });
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Unknown team');
    });
  });
});
