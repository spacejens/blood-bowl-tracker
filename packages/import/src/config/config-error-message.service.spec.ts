import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigErrorMessageService } from './config-error-message.service';

describe('ConfigErrorMessageService', () => {
  let service: ConfigErrorMessageService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ConfigErrorMessageService],
    }).compile();
    service = moduleRef.get(ConfigErrorMessageService);
  });

  it('renders a nested object path with dots', () => {
    const schema = z.object({
      identity: z.object({ name: z.string('must be a non-empty string.') }),
    });
    const result = schema.safeParse({ identity: { name: 7 } });
    expect(service.format('BBL_ERAS[0]', result.error!)).toBe(
      'BBL_ERAS[0].identity.name must be a non-empty string.',
    );
  });

  it('renders an array index with brackets', () => {
    const schema = z.object({
      positions: z.array(z.object({ raceId: z.string('must be a string.') })),
    });
    const result = schema.safeParse({ positions: [{ raceId: 1 }] });
    expect(service.format('BBL_ERAS[3]', result.error!)).toBe(
      'BBL_ERAS[3].positions[0].raceId must be a string.',
    );
  });

  it('renders a root-level issue as just the prefix plus the message', () => {
    const schema = z.object({}, { error: 'must be an object.' });
    const result = schema.safeParse('nope');
    expect(service.format('BBL_ERAS[1]', result.error!)).toBe(
      'BBL_ERAS[1] must be an object.',
    );
  });

  it('reports the first issue when several fields are wrong', () => {
    const schema = z.object({
      a: z.string('a must be a string.'),
      b: z.string('b must be a string.'),
    });
    const result = schema.safeParse({ a: 1, b: 2 });
    expect(service.format('X', result.error!)).toBe('X.a a must be a string.');
  });
});
