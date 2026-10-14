import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ArchiveParserService } from '../archive/archive-parser.service';
import { PgArchiveService } from '../archive/pg-archive.service';
import { BackupChecksService } from '../verify-backup/backup-checks.service';
import { BackupInspectionService } from './backup-inspection.service';

const WORK_DIR = '/tmp/backup-cli-restore-production-abc';
const DUMP = `${WORK_DIR}/backup.dump`;
const LOCAL = ['0001_a', '0002_b', '0003_c'];
const CONTENTS = {
  migrations: ['0001_a', '0002_b'],
  tableRowCounts: {
    coaches: 3,
    teams: 5,
    players: 70,
    matches: 9,
    competitions: 2,
  },
};
const REQUEST = { dumpPath: DUMP, workDir: WORK_DIR, localMigrations: LOCAL };

describe('BackupInspectionService', () => {
  let service: BackupInspectionService;
  let archive: MockProxy<PgArchiveService>;
  let parser: MockProxy<ArchiveParserService>;
  let checks: MockProxy<BackupChecksService>;

  beforeEach(async () => {
    archive = mock<PgArchiveService>();
    parser = mock<ArchiveParserService>();
    checks = mock<BackupChecksService>();
    archive.listContents.mockResolvedValue('listing');
    archive.extractData.mockResolvedValue('data script');
    parser.schemas.mockReturnValue([
      'discord_bot_usage',
      'drizzle',
      'game_data',
    ]);
    parser.contents.mockReturnValue(CONTENTS);
    checks.checkMigrations.mockReturnValue([]);
    checks.checkTableRowCounts.mockReturnValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackupInspectionService,
        { provide: PgArchiveService, useValue: archive },
        { provide: ArchiveParserService, useValue: parser },
        { provide: BackupChecksService, useValue: checks },
      ],
    }).compile();
    service = moduleRef.get(BackupInspectionService);
  });

  it('returns the backup contents when every check passes', async () => {
    await expect(service.inspect(REQUEST)).resolves.toEqual(CONTENTS);
    expect(archive.listContents).toHaveBeenCalledWith(DUMP);
    expect(parser.schemas).toHaveBeenCalledWith('listing');
    expect(archive.extractData).toHaveBeenCalledWith({
      dumpPath: DUMP,
      outputPath: `${WORK_DIR}/backup-data.sql`,
    });
    expect(parser.contents).toHaveBeenCalledWith('data script');
    expect(checks.checkMigrations).toHaveBeenCalledWith({
      restored: CONTENTS.migrations,
      local: LOCAL,
    });
    expect(checks.checkTableRowCounts).toHaveBeenCalledWith(
      CONTENTS.tableRowCounts,
    );
  });

  it('accepts an archive that lists no public schema entry', async () => {
    parser.schemas.mockReturnValue(['game_data']);

    await expect(service.inspect(REQUEST)).resolves.toEqual(CONTENTS);
  });

  it('refuses a backup with a schema outside the application schemas, before extracting data', async () => {
    parser.schemas.mockReturnValue(['game_data', 'neon', 'zzz']);

    await expect(service.inspect(REQUEST)).rejects.toThrow(
      'The backup contains schemas outside the application schemas ' +
        '(game_data, discord_bot_usage, drizzle, public): neon, zzz. ' +
        'Refusing to restore it into production.',
    );
    expect(archive.extractData).not.toHaveBeenCalled();
  });

  it('lists every failed check in one error', async () => {
    checks.checkMigrations.mockReturnValue([
      'The backup records migrations absent from packages/db/migrations: 0009_x.',
    ]);
    checks.checkTableRowCounts.mockReturnValue([
      'game_data.teams has no rows.',
    ]);

    await expect(service.inspect(REQUEST)).rejects.toThrow(
      [
        'The backup is not safe to restore into production from this checkout:',
        '- The backup records migrations absent from packages/db/migrations: 0009_x.',
        '- game_data.teams has no rows.',
      ].join('\n'),
    );
  });

  it('propagates an unreadable archive', async () => {
    archive.listContents.mockRejectedValue(
      new Error('pg_restore could not read the backup (exit code 1): bad'),
    );

    await expect(service.inspect(REQUEST)).rejects.toThrow(
      'pg_restore could not read the backup (exit code 1): bad',
    );
  });
});
