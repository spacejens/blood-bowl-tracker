import { Injectable } from '@nestjs/common';

import { ComputePrSplitInput } from './compute-pr-split-args.service';
import { DiffFileCountService } from './diff-file-count.service';
import { CODERABBIT_SAFE_FILE_LIMIT } from './pr-split-limit';
import {
  PrSplitPackingService,
  PrSplitPartBoundary,
  UnsplittableTask,
} from './pr-split-packing.service';
import { TaskCheckpointGroupingService } from './task-checkpoint-grouping.service';

export interface PrSplitPart extends PrSplitPartBoundary {
  /** 1-based; part `i`'s PR is based on part `i-1`'s branch. */
  readonly partNumber: number;
}

export interface ComputePrSplitResult {
  /** Echoed so callers never restate the threshold themselves. */
  readonly limit: number;
  readonly totalFileCount: number;
  readonly splitNeeded: boolean;
  /** Empty only when `unsplittable` is present. */
  readonly parts: readonly PrSplitPart[];
  /** Present only when no valid split exists. */
  readonly unsplittable?: UnsplittableTask;
}

/**
 * Answers whether a feature branch would be too large for CodeRabbit to
 * review as one PR and, if so, where to cut it into stacked PRs.
 *
 * The branch tip — not the last task's commit — bounds the whole calculation,
 * so self-review fix commits made after the final task are counted, and are
 * always attributed to the last part. Attributing each such commit to
 * whichever section owns its files would add real complexity for little
 * benefit: these commits are typically small and cross-cutting.
 */
@Injectable()
export class ComputePrSplitService {
  constructor(
    private readonly grouping: TaskCheckpointGroupingService,
    private readonly packing: PrSplitPackingService,
    private readonly fileCount: DiffFileCountService,
  ) {}

  async run(input: ComputePrSplitInput): Promise<ComputePrSplitResult> {
    const totalFileCount = await this.fileCount.count(
      input.baseRef,
      input.headRef,
    );
    const sections = this.grouping.byTopLevelSection(input.checkpoints);

    if (totalFileCount <= CODERABBIT_SAFE_FILE_LIMIT) {
      return {
        limit: CODERABBIT_SAFE_FILE_LIMIT,
        totalFileCount,
        splitNeeded: false,
        parts: [
          {
            partNumber: 1,
            sectionsCovered: sections.map((section) => section.label),
            commitSha: input.headRef,
            fileCount: totalFileCount,
          },
        ],
      };
    }

    const packing = await this.packing.pack(sections, input.baseRef);
    if ('unsplittable' in packing) {
      return {
        limit: CODERABBIT_SAFE_FILE_LIMIT,
        totalFileCount,
        splitNeeded: true,
        parts: [],
        unsplittable: packing.unsplittable,
      };
    }

    return {
      limit: CODERABBIT_SAFE_FILE_LIMIT,
      totalFileCount,
      splitNeeded: true,
      parts: await this.numberParts(packing.packed, input),
    };
  }

  /** Numbers the parts and extends the last one to the branch tip. */
  private async numberParts(
    boundaries: readonly PrSplitPartBoundary[],
    input: ComputePrSplitInput,
  ): Promise<readonly PrSplitPart[]> {
    const lastIndex = boundaries.length - 1;
    const previousSha =
      lastIndex === 0 ? input.baseRef : boundaries[lastIndex - 1].commitSha;
    const lastFileCount = await this.fileCount.count(
      previousSha,
      input.headRef,
    );
    return boundaries.map((boundary, index) => ({
      partNumber: index + 1,
      sectionsCovered: boundary.sectionsCovered,
      commitSha: index === lastIndex ? input.headRef : boundary.commitSha,
      fileCount: index === lastIndex ? lastFileCount : boundary.fileCount,
    }));
  }
}
