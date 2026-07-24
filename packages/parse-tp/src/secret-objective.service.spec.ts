import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  secretObjectiveByCode,
  SecretObjectiveService,
} from './secret-objective.service';

describe('SecretObjectiveService', () => {
  let service: SecretObjectiveService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SecretObjectiveService],
    }).compile();
    service = moduleRef.get(SecretObjectiveService);
  });

  it.each(Object.entries(secretObjectiveByCode))(
    'decodes code %s to %s',
    (code, expected) => {
      expect(service.decode(Number(code))).toBe(expected);
    },
  );

  it('decodes an unknown code to unknown', () => {
    expect(service.decode(999)).toBe('unknown');
  });

  it('has a decode test for every known secret-objective code (guards against silent shrinkage of the code map)', () => {
    expect(Object.keys(secretObjectiveByCode)).toHaveLength(16);
  });
});
