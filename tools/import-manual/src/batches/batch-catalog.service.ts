import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import type { BatchPhase, ManualBatch } from './manual-batch';

const BATCH_NAME = /^(\d{3})-(before|after)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class BatchCatalogService {
  /**
   * Every batch directory under `<dataDir>/batches`, in number order. Files
   * beside the directories (e.g. `.DS_Store`) are ignored; a directory not
   * named `NNN-<before|after>-<slug>`, two batches sharing a number, or a
   * `before` batch numbered above an `after` batch is an error -- a full
   * import applies every `before` batch, then the source importers, then
   * every `after` batch, so the numbers must read in that order too.
   */
  async discover(dataDir: string): Promise<ManualBatch[]> {
    const root = join(dataDir, 'batches');
    const entries = await readdir(root, { withFileTypes: true });
    const batches = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.parse(root, entry.name))
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
    this.assertUniqueNumbers(batches);
    this.assertPhaseOrder(batches);
    return batches;
  }

  private parse(root: string, name: string): ManualBatch {
    const match = BATCH_NAME.exec(name);
    if (match === null) {
      throw new Error(
        `Batch directory "${name}" in ${root} is not named NNN-<before|after>-<slug> (three digits, the phase, then a lowercase hyphenated slug).`,
      );
    }
    const phase: BatchPhase = match[2] === 'before' ? 'before' : 'after';
    return { name, number: Number(match[1]), phase, dir: join(root, name) };
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

  private assertPhaseOrder(batches: ManualBatch[]): void {
    const firstAfter = batches.find((batch) => batch.phase === 'after');
    const lateBefore = batches.find(
      (batch) =>
        batch.phase === 'before' &&
        firstAfter !== undefined &&
        batch.number > firstAfter.number,
    );
    if (lateBefore !== undefined && firstAfter !== undefined) {
      throw new Error(
        `Batch "${lateBefore.name}" is a before batch numbered above the after batch "${firstAfter.name}"; every before batch must be numbered below every after batch.`,
      );
    }
  }
}
