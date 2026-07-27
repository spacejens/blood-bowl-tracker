import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/**
 * Writes the report to a timestamped path next to the configured output
 * path (gitignored — a developer-local artifact, same convention as
 * docs/schemaspy-output/). The timestamp lets multiple runs' reports exist
 * side by side instead of each one silently overwriting the last.
 */
@Injectable()
export class ReportWriterService {
  constructor(private readonly config: ReviewMatchConfigService) {}

  /** Write the document and return the absolute path it landed at. */
  async write(html: string, generatedAt: Date): Promise<string> {
    const outputPath = this.timestampedPath(
      this.config.getOutputPath(),
      generatedAt,
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
    return outputPath;
  }

  /** `<configured path>` with `-<generatedAt>` inserted before the extension. */
  private timestampedPath(configuredPath: string, generatedAt: Date): string {
    const stamp = generatedAt
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z')
      .replaceAll(':', '-');
    const ext = extname(configuredPath);
    const base = configuredPath.slice(0, configuredPath.length - ext.length);
    return `${base}-${stamp}${ext}`;
  }
}
