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

  it('replaces every occurrence of the URL with one whose password is masked', () => {
    expect(
      service.redact(`a ${DATABASE_URL} b ${DATABASE_URL}`, DATABASE_URL),
    ).toBe(
      'a postgresql://user:<password>@ep-x.neon.tech/neondb b postgresql://user:<password>@ep-x.neon.tech/neondb',
    );
  });

  it('keeps host, user, port, database and query readable', () => {
    expect(
      service.redact(
        'x postgresql://u:p%40ss@h.example:6543/db?sslmode=require y',
        'postgresql://u:p%40ss@h.example:6543/db?sslmode=require',
      ),
    ).toBe('x postgresql://u:<password>@h.example:6543/db?sslmode=require y');
  });

  it('masks the password of a URL that has none, so the original never survives', () => {
    expect(
      service.redact(
        'see postgresql://postgres@localhost/db',
        'postgresql://postgres@localhost/db',
      ),
    ).toBe('see postgresql://postgres:<password>@localhost/db');
  });

  it('replaces an unparseable connection string with a fixed placeholder', () => {
    expect(service.redact('failed for not-a-url', 'not-a-url')).toBe(
      'failed for <database-url>',
    );
  });

  it('leaves text alone when it does not contain the URL', () => {
    expect(service.redact('nothing here', DATABASE_URL)).toBe('nothing here');
  });
});
