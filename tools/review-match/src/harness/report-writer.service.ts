import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/**
 * Writes the report to the configured output path (gitignored — a
 * developer-local artifact, same convention as docs/schemaspy-output/).
 */
@Injectable()
export class ReportWriterService {
  constructor(private readonly config: ReviewMatchConfigService) {}

  /** Write the document and return the absolute path it landed at. */
  async write(html: string): Promise<string> {
    const outputPath = this.config.getOutputPath();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
    return outputPath;
  }
}
