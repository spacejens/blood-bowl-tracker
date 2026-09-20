import { Injectable } from '@nestjs/common';

import { DiffFileCountService } from './diff-file-count.service';
import { CODERABBIT_SAFE_FILE_LIMIT } from './pr-split-limit';
import {
  CheckpointGroup,
  TaskCheckpointGroupingService,
} from './task-checkpoint-grouping.service';

/** One stacked PR's worth of work: what it covers, where it ends, how big it is. */
export interface PrSplitPartBoundary {
  readonly sectionsCovered: readonly string[];
  readonly commitSha: string;
  readonly fileCount: number;
}

/** A single task whose own commit is already over the limit — nothing can split it. */
export interface UnsplittableTask {
  readonly taskNumber: number;
  readonly label: string;
  readonly fileCount: number;
}

export type PrSplitPacking =
  | { readonly packed: readonly PrSplitPartBoundary[] }
  | { readonly unsplittable: UnsplittableTask };

/**
 * Greedily packs an ordered list of checkpoint groups into the largest parts
 * that still fit under the file limit, going finer — subsections, then
 * individual tasks — only for a group that does not fit on its own. "As fine
 * as necessary, but no finer": most of a plan still splits at its section
 * boundaries even when one section has to be broken up.
 */
@Injectable()
export class PrSplitPackingService {
  constructor(
    private readonly grouping: TaskCheckpointGroupingService,
    private readonly fileCount: DiffFileCountService,
  ) {}

  async pack(
    groups: readonly CheckpointGroup[],
    startRef: string,
  ): Promise<PrSplitPacking> {
    const parts: PrSplitPartBoundary[] = [];
    let partStartRef = startRef;
    let pending: CheckpointGroup[] = [];
    let pendingFileCount = 0;

    for (const group of groups) {
      let count = await this.fileCount.count(partStartRef, group.commitSha);
      if (count > CODERABBIT_SAFE_FILE_LIMIT && pending.length > 0) {
        // Close the current part at the previous group's boundary, then
        // re-measure this group on its own against that new start.
        parts.push(this.closePart(pending, pendingFileCount));
        partStartRef = pending[pending.length - 1].commitSha;
        pending = [];
        pendingFileCount = 0;
        count = await this.fileCount.count(partStartRef, group.commitSha);
      }

      if (count <= CODERABBIT_SAFE_FILE_LIMIT) {
        pending.push(group);
        pendingFileCount = count;
        continue;
      }

      // The group is over the limit even as a part of its own, so it has to
      // be broken up internally.
      const subdivided = await this.subdivide(group, partStartRef);
      if ('unsplittable' in subdivided) {
        return subdivided;
      }
      parts.push(...subdivided.packed);
      // Every sub-part chain ends at this group's own last commit.
      partStartRef = group.commitSha;
    }

    if (pending.length > 0) {
      parts.push(this.closePart(pending, pendingFileCount));
    }
    return { packed: parts };
  }

  /** Breaks one oversized group down a level and packs it against the same start. */
  private async subdivide(
    group: CheckpointGroup,
    startRef: string,
  ): Promise<PrSplitPacking> {
    const subsections = this.grouping.bySubsection(group);
    if (subsections.length > 1) {
      return this.pack(subsections, startRef);
    }
    const tasks = this.grouping.byTask(group);
    if (tasks.length > 1) {
      return this.pack(tasks, startRef);
    }
    const only = tasks[0];
    return {
      unsplittable: {
        taskNumber: only.checkpoints[0].taskNumber,
        label: only.label,
        fileCount: await this.fileCount.count(startRef, only.commitSha),
      },
    };
  }

  private closePart(
    groups: readonly CheckpointGroup[],
    fileCount: number,
  ): PrSplitPartBoundary {
    return {
      sectionsCovered: groups.map((group) => group.label),
      commitSha: groups[groups.length - 1].commitSha,
      fileCount,
    };
  }
}
