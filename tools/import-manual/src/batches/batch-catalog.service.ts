import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import type { ManualBatch } from './manual-batch';

const BATCH_NAME = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class BatchCatalogService {
  /**
   * Every batch directory under `<dataDir>/batches`, in number order. Files
   * beside the directories (e.g. `.DS_Store`) are ignored; a directory not
   * named `NNN-<slug>` or two batches sharing a number is an error.
   */
  async discover(dataDir: string): Promise<ManualBatch[]> {
    const root = join(dataDir, 'batches');
    const entries = await readdir(root, { withFileTypes: true });
    const batches = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.parse(root, entry.name))
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
    this.assertUniqueNumbers(batches);
    return batches;
  }

  private parse(root: string, name: string): ManualBatch {
    const match = BATCH_NAME.exec(name);
    if (match === null) {
      throw new Error(
        `Batch directory "${name}" in ${root} is not named NNN-<slug> (three digits, then a lowercase hyphenated slug).`,
      );
    }
    return { name, number: Number(match[1]), dir: join(root, name) };
  }

  private assertUniqueNumbers(batches: ManualBatch[]): void {
    for (let i = 1; i < batches.length; i += 1) {
      if (batches[i].number === batches[i - 1].number) {
        throw new Error(
          `Batches "${batches[i - 1].name}" and "${batches[i].name}" share the number ${String(batches[i].number).padStart(3, '0')}.`,
        );
      }
    }
  }
}
