import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { FileSystemService } from './file-system.service';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('FileSystemService', () => {
  let service: FileSystemService;
  let configService: MockProxy<ConfigService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    configService = mock<ConfigService>();
    configService.getOrThrow.mockReturnValue('tourplay.net-major30');
    const moduleRef = await Test.createTestingModule({
      providers: [
        FileSystemService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(FileSystemService);
  });

  it('creates a missing directory under the configured output dir', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    service.mkdir('tournaments/season-30');

    expect(configService.getOrThrow).toHaveBeenCalledWith('OUTPUT_DIR');
    expect(mkdirSync).toHaveBeenCalledWith(
      'tp-site/tourplay.net-major30/tournaments/season-30',
      { recursive: true },
    );
  });

  it('does not recreate a directory that already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    service.mkdir('tournaments/season-30');

    expect(existsSync).toHaveBeenCalledWith(
      'tp-site/tourplay.net-major30/tournaments/season-30',
    );
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('writes pretty-printed JSON, flattening slashes in the file name', () => {
    service.writeJsonFile('tournaments/season-30', 'phases?type=COACH/x', {
      a: 1,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      'tp-site/tourplay.net-major30/tournaments/season-30/phases?type=COACH_x.json',
      JSON.stringify({ a: 1 }, null, 2),
    );
  });
});
