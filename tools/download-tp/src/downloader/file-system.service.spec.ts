import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileSystemService } from './file-system.service';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('FileSystemService', () => {
  let service: FileSystemService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [FileSystemService],
    }).compile();
    service = moduleRef.get(FileSystemService);
  });

  it('creates a missing directory under the fixed data output dir', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    service.mkdir('season-30');

    expect(mkdirSync).toHaveBeenCalledWith('data/season-30', {
      recursive: true,
    });
  });

  it('does not recreate a directory that already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    service.mkdir('season-30');

    expect(existsSync).toHaveBeenCalledWith('data/season-30');
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('writes pretty-printed JSON, flattening slashes in the file name', () => {
    service.writeJsonFile('season-30', 'phases?type=COACH/x', { a: 1 });

    expect(writeFileSync).toHaveBeenCalledWith(
      'data/season-30/phases?type=COACH_x.json',
      JSON.stringify({ a: 1 }, null, 2),
    );
  });
});
