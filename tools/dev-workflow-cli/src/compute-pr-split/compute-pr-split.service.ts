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

/**
 * After remeasuring the last part against the branch tip, it is still over
 * the limit and there is no further checkpoint to cut it at — either because
 * `pack` only ever produced one usable part to begin with, or because
 * self-review fix commits made after the final task's checkpoint pushed
 * just the last part's content back over the limit even though the earlier
 * parts (if any) were fine on their own. Either way, `pack` has nothing left
 * to cut: the excess lives entirely in commits after every recorded
 * checkpoint, which have no cut point of their own. Distinct from
 * `UnsplittableTask`: no single task is to blame, the branch just ran out of
 * places to cut.
 */
export interface UnsplittableWholeBranch {
  readonly fileCount: number;
}

export interface ComputePrSplitResult {
  /** Echoed so callers never restate the threshold themselves. */
  readonly limit: number;
  readonly totalFileCount: number;
  readonly splitNeeded: boolean;
  /** Empty when `unsplittable` or `unsplittableWholeBranch` is present. */
  readonly parts: readonly PrSplitPart[];
  /** Present only when a single task's own commit exceeds the limit. */
  readonly unsplittable?: UnsplittableTask;
  /**
   * Present only when the last part, once remeasured to the branch tip, is
   * still over the limit and there is no further checkpoint left to cut it
   * at — whether packing produced only one usable part to begin with, or
   * produced two or more that were all fine except the last. `fileCount` is
   * that unsplittable last part's own size, not `totalFileCount`. Never
   * present at the same time as `unsplittable`.
   */
  readonly unsplittableWholeBranch?: UnsplittableWholeBranch;
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

    const numbered = await this.numberParts(packing.packed, input);
    if ('unsplittableWholeBranch' in numbered) {
      return {
        limit: CODERABBIT_SAFE_FILE_LIMIT,
        totalFileCount,
        splitNeeded: true,
        parts: [],
        unsplittableWholeBranch: numbered.unsplittableWholeBranch,
      };
    }

    return {
      limit: CODERABBIT_SAFE_FILE_LIMIT,
      totalFileCount,
      splitNeeded: true,
      parts: numbered.parts,
    };
  }

  /**
   * Numbers the parts and extends the last one to the branch tip. Reports
   * `unsplittableWholeBranch` instead of a parts array whenever the last
   * part, once remeasured to the branch tip, is still over the limit — this
   * covers both the "only one group existed to begin with" case and the
   * "two or more parts packed fine, but fix commits after the last task
   * pushed just the final part over" case; neither has a further checkpoint
   * to cut at.
   */
  private async numberParts(
    boundaries: readonly PrSplitPartBoundary[],
    input: ComputePrSplitInput,
  ): Promise<
    | { readonly parts: readonly PrSplitPart[] }
    | { readonly unsplittableWholeBranch: UnsplittableWholeBranch }
  > {
    if (boundaries.length === 0) {
      // `pack` always emits at least one part for a non-empty checkpoint
      // list, and the checkpoints schema requires at least one entry — this
      // is an internal-invariant violation, not a reachable user-facing case.
      throw new Error(
        'compute-pr-split: pack() returned no boundaries for a non-empty checkpoint list',
      );
    }
    const lastIndex = boundaries.length - 1;
    const previousSha =
      lastIndex === 0 ? input.baseRef : boundaries[lastIndex - 1].commitSha;
    const lastFileCount = await this.fileCount.count(
      previousSha,
      input.headRef,
    );

    if (lastFileCount > CODERABBIT_SAFE_FILE_LIMIT) {
      return { unsplittableWholeBranch: { fileCount: lastFileCount } };
    }

    return {
      parts: boundaries.map((boundary, index) => ({
        partNumber: index + 1,
        sectionsCovered: boundary.sectionsCovered,
        commitSha: index === lastIndex ? input.headRef : boundary.commitSha,
        fileCount: index === lastIndex ? lastFileCount : boundary.fileCount,
      })),
    };
  }
}
