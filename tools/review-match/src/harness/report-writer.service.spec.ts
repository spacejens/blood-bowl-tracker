import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import { ReportWriterService } from './report-writer.service';

describe('ReportWriterService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-match-report-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeService(outputPath: string): Promise<ReportWriterService> {
    const config = mock<ReviewMatchConfigService>();
    config.getOutputPath.mockReturnValue(outputPath);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportWriterService,
        { provide: ReviewMatchConfigService, useValue: config },
      ],
    }).compile();
    return moduleRef.get(ReportWriterService);
  }

  it('writes the document to the configured path and returns it', async () => {
    const outputPath = join(dir, 'report.html');
    const service = await makeService(outputPath);

    await expect(service.write('<html></html>')).resolves.toBe(outputPath);
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('<html></html>');
  });

  it('creates the output directory when it does not exist yet', async () => {
    const outputPath = join(dir, 'nested', 'output', 'report.html');
    const service = await makeService(outputPath);

    await service.write('<html></html>');

    await expect(readFile(outputPath, 'utf8')).resolves.toBe('<html></html>');
  });

  it('overwrites a report from a previous run', async () => {
    const outputPath = join(dir, 'report.html');
    const service = await makeService(outputPath);

    await service.write('<html>old</html>');
    await service.write('<html>new</html>');

    await expect(readFile(outputPath, 'utf8')).resolves.toBe(
      '<html>new</html>',
    );
  });
});
