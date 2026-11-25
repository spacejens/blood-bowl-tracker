import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import type { ManualBatch } from './manual-batch.types';
import { ManualBatchNameService } from './manual-batch-name.service';

/**
 * The manual-import batch layout: `NNN-<slug>` directories under a batches
 * directory, each holding `.json5` files. The strict listings are for the
 * importer and the planner, which must refuse a malformed layout; the
 * lenient ones are for the review tools, which show what they can read.
 */
@Injectable()
export class ManualBatchLayoutService {
  constructor(private readonly names: ManualBatchNameService) {}

  async listBatches(batchesDir: string): Promise<ManualBatch[]> {
    const entries = await readdir(batchesDir, { withFileTypes: true });
    const batches = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.batch(batchesDir, entry.name))
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
    for (let i = 1; i < batches.length; i += 1) {
      if (batches[i].number === batches[i - 1].number) {
        throw new Error(
          `Batches "${batches[i - 1].name}" and "${batches[i].name}" share the number ${String(batches[i].number).padStart(3, '0')}.`,
        );
      }
    }
    return batches;
  }

  async listBatchDirsLenient(batchesDir: string): Promise<string[]> {
    return (await this.entriesOrNone(batchesDir))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  async listJson5Files(dir: string): Promise<string[]> {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json5'))
      .map((entry) => entry.name)
      .sort();
  }

  async listJson5FilesLenient(dir: string): Promise<string[]> {
    return (await this.entriesOrNone(dir))
      .filter((entry) => entry.name.endsWith('.json5'))
      .map((entry) => entry.name)
      .sort();
  }

  async readJson5(path: string): Promise<unknown> {
    const raw = await readFile(path, 'utf8');
    try {
      return JSON5.parse<unknown>(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private batch(root: string, name: string): ManualBatch {
    const parsed = this.names.parse(name);
    if (parsed === null) {
      throw new Error(
        `Batch directory "${name}" in ${root} is not named NNN-<slug> (three digits, then a lowercase hyphenated slug).`,
      );
    }
    return { name, number: parsed.number, dir: join(root, name) };
  }

  private async entriesOrNone(dir: string): Promise<Dirent[]> {
    try {
      return await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  }
}
