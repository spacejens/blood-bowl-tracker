import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

/** DI token for whatever supplies the configured report output path. */
export const REPORT_OUTPUT_PATH = Symbol('REPORT_OUTPUT_PATH');

/**
 * The one thing the writer needs from a tool's config service. Injected by
 * token so the shared writer does not depend on either tool's concrete config
 * class; each tool binds it with `{ provide: REPORT_OUTPUT_PATH, useExisting:
 * <Tool>ConfigService }`.
 */
export interface ReportOutputPathProvider {
  getOutputPath(): string;
}

/**
 * Writes the report to a timestamped path next to the configured output
 * path (gitignored — a developer-local artifact, same convention as
 * docs/schemaspy-output/). The timestamp lets multiple runs' reports exist
 * side by side instead of each one silently overwriting the last.
 */
@Injectable()
export class ReportWriterService {
  constructor(
    @Inject(REPORT_OUTPUT_PATH)
    private readonly config: ReportOutputPathProvider,
  ) {}

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
