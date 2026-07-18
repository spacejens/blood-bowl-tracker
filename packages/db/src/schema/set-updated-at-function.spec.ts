import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('set_updated_at trigger function', () => {
  const path = join(__dirname, '../../sql/set_updated_at_function.sql');
  const content = readFileSync(path, 'utf-8');

  it('sets NEW.updated_at to now() and returns NEW', () => {
    expect(content).toContain('CREATE OR REPLACE FUNCTION set_updated_at()');
    expect(content).toContain('NEW.updated_at = now();');
    expect(content).toContain('RETURN NEW;');
  });

  it('skips the bump when NEW is already identical to OLD, checked before the bump', () => {
    expect(content).toContain('IF NEW IS NOT DISTINCT FROM OLD THEN');
    expect(
      content.indexOf('IF NEW IS NOT DISTINCT FROM OLD THEN'),
    ).toBeLessThan(content.indexOf('NEW.updated_at = now();'));
  });
});
