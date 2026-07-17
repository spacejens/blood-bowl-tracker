import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('reject_no_op_update trigger function', () => {
  it('returns NULL for a no-op update and NEW otherwise', () => {
    const path = join(__dirname, '../../sql/reject_no_op_update_function.sql');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain(
      'CREATE OR REPLACE FUNCTION reject_no_op_update()',
    );
    expect(content).toContain('IF NEW IS NOT DISTINCT FROM OLD THEN');
    expect(content).toContain('RETURN NULL;');
    expect(content).toContain('RETURN NEW;');
  });
});
