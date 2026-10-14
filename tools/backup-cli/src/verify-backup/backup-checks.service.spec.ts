import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BackupChecksService } from './backup-checks.service';

const LOCAL = ['0001_a', '0002_b', '0003_c', '0004_d'];

const ALL_POPULATED = {
  coaches: 3,
  teams: 4,
  players: 50,
  matches: 9,
  competitions: 1,
};

describe('BackupChecksService', () => {
  let service: BackupChecksService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BackupChecksService],
    }).compile();
    service = moduleRef.get(BackupChecksService);
  });

  describe('checkMigrations', () => {
    it('passes when the backup records every checkout migration', () => {
      expect(
        service.checkMigrations({ restored: LOCAL, local: LOCAL }),
      ).toEqual([]);
    });

    it('passes when the backup records only the oldest migrations, in any order', () => {
      expect(
        service.checkMigrations({
          restored: ['0002_b', '0001_a'],
          local: LOCAL,
        }),
      ).toEqual([]);
    });

    it('fails when the backup records no migrations', () => {
      expect(service.checkMigrations({ restored: [], local: LOCAL })).toEqual([
        'The backup records no applied migrations.',
      ]);
    });

    it('fails, naming them, when the backup records migrations unknown to the checkout', () => {
      expect(
        service.checkMigrations({
          restored: ['0001_a', '0002_b', '0099_x', '0098_y'],
          local: LOCAL,
        }),
      ).toEqual([
        'The backup records migrations absent from packages/db/migrations: 0099_x, 0098_y.',
      ]);
    });

    it('fails, naming them, when the backup skips migrations older than its newest', () => {
      expect(
        service.checkMigrations({
          restored: ['0001_a', '0004_d'],
          local: LOCAL,
        }),
      ).toEqual([
        'The backup skips migrations older than its newest one: 0002_b, 0003_c.',
      ]);
    });

    it('fails when the backup records a migration twice', () => {
      expect(
        service.checkMigrations({
          restored: ['0001_a', '0001_a'],
          local: LOCAL,
        }),
      ).toEqual(['The backup records a migration more than once: 0001_a.']);
    });

    it('reports every failed migration check at once', () => {
      expect(
        service.checkMigrations({
          restored: ['0003_c', '0099_x'],
          local: LOCAL,
        }),
      ).toEqual([
        'The backup records migrations absent from packages/db/migrations: 0099_x.',
        'The backup skips migrations older than its newest one: 0001_a, 0002_b.',
      ]);
    });
  });

  describe('checkTableRowCounts', () => {
    it('passes when every key table has rows', () => {
      expect(service.checkTableRowCounts(ALL_POPULATED)).toEqual([]);
    });

    it('fails for every empty or missing key table', () => {
      expect(
        service.checkTableRowCounts({
          coaches: 3,
          teams: 0,
          players: 50,
          competitions: 0,
        }),
      ).toEqual([
        'game_data.teams has no rows.',
        'game_data.matches has no rows.',
        'game_data.competitions has no rows.',
      ]);
    });
  });
});
