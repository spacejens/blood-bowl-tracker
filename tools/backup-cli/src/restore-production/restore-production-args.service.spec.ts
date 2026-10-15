import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RESTORE_PRODUCTION_CONFIRMATION as PHRASE } from './restore-production.service';
import {
  RESTORE_PRODUCTION_USAGE,
  RestoreProductionArgsService,
} from './restore-production-args.service';

const KEY = 'production/2026-10-14T03-17-00.000Z.dump';

describe('RestoreProductionArgsService', () => {
  let service: RestoreProductionArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RestoreProductionArgsService],
    }).compile();
    service = moduleRef.get(RestoreProductionArgsService);
  });

  it('defaults to a real run of the newest backup with no confirmation', () => {
    expect(service.parse([])).toEqual({ dryRun: false });
  });

  it('reads a key and --dry-run in either order', () => {
    expect(service.parse([KEY, '--dry-run'])).toEqual({
      key: KEY,
      dryRun: true,
    });
    expect(service.parse(['--dry-run', KEY])).toEqual({
      key: KEY,
      dryRun: true,
    });
  });

  it('reads --confirm with its value', () => {
    expect(service.parse(['--confirm', PHRASE, KEY])).toEqual({
      key: KEY,
      dryRun: false,
      confirm: PHRASE,
    });
  });

  it('ignores an empty positional argument', () => {
    expect(service.parse([''])).toEqual({ dryRun: false });
  });

  it.each([
    ['--confirm without a value', ['--confirm']],
    ['--confirm with an empty value', ['--confirm', '']],
    ['--confirm twice', ['--confirm', PHRASE, '--confirm', PHRASE]],
    ['an unknown flag', ['--force']],
    ['two keys', [KEY, 'production/other.dump']],
  ])('refuses %s with the usage text', (_label, args: string[]) => {
    expect(() => service.parse(args)).toThrow(RESTORE_PRODUCTION_USAGE);
  });

  it.each([
    ['the phrase', PHRASE],
    ['a wrong phrase', 'yes'],
  ])('refuses --dry-run together with --confirm and %s', (_label, phrase) => {
    expect(() =>
      service.parse(['--dry-run', '--confirm', phrase, KEY]),
    ).toThrow(
      `--dry-run and --confirm cannot be combined. ${RESTORE_PRODUCTION_USAGE}`,
    );
  });

  it('refuses --confirm without an explicit backup key', () => {
    expect(() => service.parse(['--confirm', PHRASE])).toThrow(
      'A real restore needs an explicit <backup-key>; it never defaults to ' +
        `the newest backup. ${RESTORE_PRODUCTION_USAGE}`,
    );
  });

  it('names the confirmation phrase in the usage text', () => {
    expect(RESTORE_PRODUCTION_USAGE).toContain(`--confirm ${PHRASE}`);
  });
});
