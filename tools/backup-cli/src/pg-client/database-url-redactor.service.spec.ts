import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DatabaseUrlRedactorService } from './database-url-redactor.service';

const DATABASE_URL = 'postgresql://user:hunter2@ep-x.neon.tech/neondb';

describe('DatabaseUrlRedactorService', () => {
  let service: DatabaseUrlRedactorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DatabaseUrlRedactorService],
    }).compile();
    service = moduleRef.get(DatabaseUrlRedactorService);
  });

  it('replaces every occurrence of the full URL', () => {
    expect(
      service.redact(`a ${DATABASE_URL} b ${DATABASE_URL}`, DATABASE_URL),
    ).toBe('a <database-url> b <database-url>');
  });

  it('replaces the bare password left after the URL is redacted', () => {
    expect(service.redact('auth failed for hunter2', DATABASE_URL)).toBe(
      'auth failed for <password>',
    );
  });

  it('redacts an unparseable connection string without a password to scrub', () => {
    expect(service.redact('failed for not-a-url', 'not-a-url')).toBe(
      'failed for <database-url>',
    );
  });

  it('leaves text alone when the URL has no password', () => {
    expect(
      service.redact('nothing here', 'postgresql://postgres@localhost/db'),
    ).toBe('nothing here');
  });
});
