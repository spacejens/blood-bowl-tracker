import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { ReportWriterService } from './report-writer.service';

describe('ReportWriterService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-player-report-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeService(outputPath: string): Promise<ReportWriterService> {
    const config = mock<ReviewPlayerConfigService>();
    config.getOutputPath.mockReturnValue(outputPath);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportWriterService,
        { provide: ReviewPlayerConfigService, useValue: config },
      ],
    }).compile();
    return moduleRef.get(ReportWriterService);
  }

  const generatedAt = new Date('2026-07-27T19:15:00.000Z');

  it('writes the document to the configured path with a timestamp inserted before the extension', async () => {
    const outputPath = join(dir, 'report.html');
    const service = await makeService(outputPath);
    const expectedPath = join(dir, 'report-2026-07-27T19-15-00Z.html');

    await expect(service.write('<html></html>', generatedAt)).resolves.toBe(
      expectedPath,
    );
    await expect(readFile(expectedPath, 'utf8')).resolves.toBe('<html></html>');
  });

  it('creates the output directory when it does not exist yet', async () => {
    const outputPath = join(dir, 'nested', 'output', 'report.html');
    const service = await makeService(outputPath);

    const written = await service.write('<html></html>', generatedAt);

    await expect(readFile(written, 'utf8')).resolves.toBe('<html></html>');
  });

  it('writes a distinct file per run instead of overwriting an earlier report', async () => {
    const outputPath = join(dir, 'report.html');
    const service = await makeService(outputPath);
    const laterGeneratedAt = new Date('2026-07-27T19:16:00.000Z');

    const firstPath = await service.write('<html>old</html>', generatedAt);
    const secondPath = await service.write(
      '<html>new</html>',
      laterGeneratedAt,
    );

    expect(firstPath).not.toBe(secondPath);
    await expect(readFile(firstPath, 'utf8')).resolves.toBe('<html>old</html>');
    await expect(readFile(secondPath, 'utf8')).resolves.toBe(
      '<html>new</html>',
    );
    await expect(readdir(dir)).resolves.toHaveLength(2);
  });
});
