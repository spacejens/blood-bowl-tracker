import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BackupAlertArgsService } from './backup-alert-args.service';

const RUN_URL =
  'https://github.com/spacejens/blood-bowl-tracker/actions/runs/123456';

describe('BackupAlertArgsService', () => {
  let service: BackupAlertArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BackupAlertArgsService],
    }).compile();
    service = moduleRef.get(BackupAlertArgsService);
  });

  const argv = (...args: readonly string[]): readonly string[] => [
    'node',
    'main.js',
    'raise-alert',
    ...args,
  ];

  it.each([
    ['backup', 'Production backup failed'],
    ['verify', 'Production backup verification failed'],
    ['stale', 'Newest production backup is stale'],
  ])('parses kind %s with its fixed issue title', (id, title) => {
    const request = service.parse(argv(id, RUN_URL));

    expect(request.runUrl).toBe(RUN_URL);
    expect(request.kind.id).toBe(id);
    expect(request.kind.title).toBe(title);
    expect(request.kind.failure).not.toBe('');
  });

  it('rejects an unknown kind, naming it', () => {
    expect(() => service.parse(argv('backups', RUN_URL))).toThrow(
      /^Usage: .*\(unknown kind: backups\)$/,
    );
  });

  it('lists every kind in the usage text', () => {
    expect(() => service.parse(argv())).toThrow('<backup|verify|stale>');
  });

  it('rejects a missing kind', () => {
    expect(() => service.parse(argv())).toThrow(/^Usage:/);
  });

  it('rejects a missing run url', () => {
    expect(() => service.parse(argv('backup'))).toThrow(/^Usage:/);
  });

  it.each([
    ['https://example.com/x/y/actions/runs/1'],
    ['https://github.com/spacejens/blood-bowl-tracker/issues/5'],
    [`${RUN_URL}/extra`],
    ['not a url'],
  ])('rejects %s as a run url', (url) => {
    expect(() => service.parse(argv('backup', url))).toThrow(
      /not a GitHub Actions run URL/,
    );
  });

  it('rejects an extra argument', () => {
    expect(() => service.parse(argv('backup', RUN_URL, 'more'))).toThrow(
      /unexpected argument: more/,
    );
  });
});
