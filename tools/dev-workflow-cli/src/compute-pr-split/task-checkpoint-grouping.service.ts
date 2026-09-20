import { Injectable } from '@nestjs/common';

import { TaskCheckpoint } from './pr-split-checkpoints.schema';

/**
 * A run of consecutive tasks that would be reviewed together, plus the commit
 * that ends it. The label is what a PR title shows for the part the group
 * lands in.
 */
export interface CheckpointGroup {
  readonly label: string;
  /** The last checkpoint's commit — the boundary a part would be cut at. */
  readonly commitSha: string;
  readonly checkpoints: readonly TaskCheckpoint[];
}

/**
 * Turns the flat, ordered checkpoint list into the successively finer
 * groupings the split algorithm walks: whole sections first, then a single
 * oversized section's subsections, then that group's individual tasks. Pure —
 * it measures nothing and reads no git state, so every case is unit-testable
 * without a repository.
 *
 * Grouping is always by consecutive run, never by name across the whole list:
 * a section that reappears after another section has intervened is a second
 * group, because a part must be a contiguous range of commits.
 */
@Injectable()
export class TaskCheckpointGroupingService {
  byTopLevelSection(
    checkpoints: readonly TaskCheckpoint[],
  ): readonly CheckpointGroup[] {
    return this.runs(checkpoints, (checkpoint) => checkpoint.sectionPath[0]);
  }

  bySubsection(group: CheckpointGroup): readonly CheckpointGroup[] {
    return this.runs(group.checkpoints, (checkpoint) =>
      checkpoint.sectionPath[1] === undefined
        ? checkpoint.sectionPath[0]
        : `${checkpoint.sectionPath[0]} > ${checkpoint.sectionPath[1]}`,
    );
  }

  byTask(group: CheckpointGroup): readonly CheckpointGroup[] {
    return group.checkpoints.map((checkpoint) => ({
      label: `${group.label} (task ${String(checkpoint.taskNumber)})`,
      commitSha: checkpoint.commitSha,
      checkpoints: [checkpoint],
    }));
  }

  /** Collects consecutive checkpoints sharing the same label into one group. */
  private runs(
    checkpoints: readonly TaskCheckpoint[],
    labelOf: (checkpoint: TaskCheckpoint) => string,
  ): readonly CheckpointGroup[] {
    const groups: CheckpointGroup[] = [];
    for (const checkpoint of checkpoints) {
      const label = labelOf(checkpoint);
      const current = groups[groups.length - 1];
      if (current !== undefined && current.label === label) {
        groups[groups.length - 1] = {
          label,
          commitSha: checkpoint.commitSha,
          checkpoints: [...current.checkpoints, checkpoint],
        };
        continue;
      }
      groups.push({
        label,
        commitSha: checkpoint.commitSha,
        checkpoints: [checkpoint],
      });
    }
    return groups;
  }
}
