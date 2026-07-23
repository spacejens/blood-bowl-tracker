import { describe, expect, it } from 'vitest';

import {
  secretObjectiveByCode,
  SecretObjectiveService,
} from './secret-objective.service';

describe('SecretObjectiveService', () => {
  const service = new SecretObjectiveService();

  it.each(Object.entries(secretObjectiveByCode))(
    'decodes code %s to %s',
    (code, expected) => {
      expect(service.decode(Number(code))).toBe(expected);
    },
  );

  it('decodes an unknown code to unknown', () => {
    expect(service.decode(999)).toBe('unknown');
  });
});
