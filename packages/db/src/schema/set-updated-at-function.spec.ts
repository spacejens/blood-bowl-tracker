import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('set_updated_at trigger function', () => {
  it('sets NEW.updated_at to now() and returns NEW', () => {
    const path = join(__dirname, '../../sql/set_updated_at_function.sql');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('CREATE OR REPLACE FUNCTION set_updated_at()');
    expect(content).toContain('NEW.updated_at = now();');
    expect(content).toContain('RETURN NEW;');
  });
});
