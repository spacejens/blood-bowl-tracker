import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DriftDiffRedactionService } from './drift-diff-redaction.service';

describe('DriftDiffRedactionService', () => {
  let service: DriftDiffRedactionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DriftDiffRedactionService],
    }).compile();
    service = moduleRef.get(DriftDiffRedactionService);
  });

  it('redacts the value of an .env-style assignment, keeping the key', () => {
    expect(service.redact('< DATABASE_URL=postgres://user:pw@host/db')).toBe(
      '< DATABASE_URL (value changed)',
    );
    expect(service.redact('> DISCORD_BOT_TOKEN=abc.def.ghi')).toBe(
      '> DISCORD_BOT_TOKEN (value changed)',
    );
  });

  it('redacts an .env assignment with spaces around the equals sign', () => {
    expect(service.redact('< API_TOKEN = secret-value')).toBe(
      '< API_TOKEN (value changed)',
    );
  });

  it('redacts the value of an unquoted JSON5 key', () => {
    expect(service.redact("<   apiToken: 'super-secret',")).toBe(
      '< apiToken (value changed)',
    );
  });

  it('redacts the value of a quoted JSON5 key, dropping the quotes', () => {
    expect(service.redact(">   'apiToken': 'super-secret',")).toBe(
      '> apiToken (value changed)',
    );
    expect(service.redact('>   "apiToken": "super-secret",')).toBe(
      '> apiToken (value changed)',
    );
  });

  it.each(['{', '}', '[', ']', '},', '],', ''])(
    'passes a structural punctuation-only line through unchanged: %j',
    (body) => {
      expect(service.redact(`< ${body}`)).toBe(`< ${body}`);
      expect(service.redact(`>   ${body}`)).toBe(`>   ${body}`);
    },
  );

  it.each(['2c2', '1,3d0', '---', '5a6'])(
    'passes a hunk header or separator line through unchanged: %j',
    (line) => {
      expect(service.redact(line)).toBe(line);
    },
  );

  it('fails closed on an unrecognized content line', () => {
    expect(service.redact("<   'continuation-of-a-secret',")).toBe(
      '< (content changed)',
    );
    expect(service.redact('> # a trailing comment')).toBe(
      '> (content changed)',
    );
  });

  it('redacts each qualifying line of a multi-line diff independently', () => {
    const raw = [
      '3c3',
      "<   apiToken: 'old-secret',",
      '---',
      "> 'apiToken': 'new-secret',",
      '6c6',
      '< DATABASE_URL=postgres://old',
      '---',
      '> DATABASE_URL=postgres://new',
    ].join('\n');

    expect(service.redact(raw)).toBe(
      [
        '3c3',
        '< apiToken (value changed)',
        '---',
        '> apiToken (value changed)',
        '6c6',
        '< DATABASE_URL (value changed)',
        '---',
        '> DATABASE_URL (value changed)',
      ].join('\n'),
    );
  });

  it('preserves structural lines interleaved with redactions', () => {
    const raw = ['2,4c2,4', '< {', "<   apiToken: 'old',", '< }'].join('\n');

    expect(service.redact(raw)).toBe(
      ['2,4c2,4', '< {', '< apiToken (value changed)', '< }'].join('\n'),
    );
  });

  it('returns an empty string unchanged', () => {
    expect(service.redact('')).toBe('');
  });
});
