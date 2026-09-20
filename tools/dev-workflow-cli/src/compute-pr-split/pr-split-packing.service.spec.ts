import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiffFileCountService } from './diff-file-count.service';
import { TaskCheckpoint } from './pr-split-checkpoints.schema';
import { PrSplitPackingService } from './pr-split-packing.service';
import {
  CheckpointGroup,
  TaskCheckpointGroupingService,
} from './task-checkpoint-grouping.service';

describe('PrSplitPackingService', () => {
  let service: PrSplitPackingService;
  let grouping: MockProxy<TaskCheckpointGroupingService>;
  let fileCount: MockProxy<DiffFileCountService>;

  beforeEach(async () => {
    grouping = mock<TaskCheckpointGroupingService>();
    fileCount = mock<DiffFileCountService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrSplitPackingService,
        { provide: TaskCheckpointGroupingService, useValue: grouping },
        { provide: DiffFileCountService, useValue: fileCount },
      ],
    }).compile();
    service = moduleRef.get(PrSplitPackingService);
  });

  const checkpoint = (taskNumber: number, label: string): TaskCheckpoint => ({
    taskNumber,
    sectionPath: [label],
    commitSha: `sha${String(taskNumber)}`,
  });

  const group = (
    label: string,
    ...checkpoints: TaskCheckpoint[]
  ): CheckpointGroup => ({
    label,
    commitSha: checkpoints[checkpoints.length - 1].commitSha,
    checkpoints,
  });

  /** Stubs `count(from, to)` from a `"<from>...<to>" -> count` table. */
  const counts = (table: Record<string, number>): void => {
    fileCount.count.mockImplementation((from: string, to: string) =>
      Promise.resolve(table[`${from}...${to}`] ?? 0),
    );
  };

  const sectionA = group('A', checkpoint(1, 'A'));
  const sectionB = group('B', checkpoint(2, 'B'));
  const sectionC = group('C', checkpoint(3, 'C'));

  it('folds every section into one part when the total fits', async () => {
    counts({
      'origin/main...sha1': 10,
      'origin/main...sha2': 40,
      'origin/main...sha3': 90,
    });

    await expect(
      service.pack([sectionA, sectionB, sectionC], 'origin/main'),
    ).resolves.toEqual({
      packed: [
        { sectionsCovered: ['A', 'B', 'C'], commitSha: 'sha3', fileCount: 90 },
      ],
    });
  });

  it('closes a part at the previous boundary when the next section would exceed the limit', async () => {
    counts({
      'origin/main...sha1': 100,
      'origin/main...sha2': 160,
      'sha1...sha2': 60,
      'sha1...sha3': 120,
    });

    await expect(
      service.pack([sectionA, sectionB, sectionC], 'origin/main'),
    ).resolves.toEqual({
      packed: [
        { sectionsCovered: ['A'], commitSha: 'sha1', fileCount: 100 },
        { sectionsCovered: ['B', 'C'], commitSha: 'sha3', fileCount: 120 },
      ],
    });
  });

  it('subdivides an oversized section by its subsections', async () => {
    const big = group('A', checkpoint(1, 'A'), checkpoint(2, 'A'));
    grouping.bySubsection.mockReturnValue([
      group('A > one', checkpoint(1, 'A')),
      group('A > two', checkpoint(2, 'A')),
    ]);
    counts({
      'origin/main...sha2': 200,
      'origin/main...sha1': 110,
      'sha1...sha2': 90,
    });

    await expect(service.pack([big], 'origin/main')).resolves.toEqual({
      packed: [
        { sectionsCovered: ['A > one'], commitSha: 'sha1', fileCount: 110 },
        { sectionsCovered: ['A > two'], commitSha: 'sha2', fileCount: 90 },
      ],
    });
    expect(grouping.byTask).not.toHaveBeenCalled();
  });

  it('falls back to per-task boundaries when a section has no subsections', async () => {
    const big = group('A', checkpoint(1, 'A'), checkpoint(2, 'A'));
    grouping.bySubsection.mockReturnValue([big]);
    grouping.byTask.mockReturnValue([
      group('A (task 1)', checkpoint(1, 'A')),
      group('A (task 2)', checkpoint(2, 'A')),
    ]);
    counts({
      'origin/main...sha2': 200,
      'origin/main...sha1': 120,
      'sha1...sha2': 80,
    });

    await expect(service.pack([big], 'origin/main')).resolves.toEqual({
      packed: [
        { sectionsCovered: ['A (task 1)'], commitSha: 'sha1', fileCount: 120 },
        { sectionsCovered: ['A (task 2)'], commitSha: 'sha2', fileCount: 80 },
      ],
    });
  });

  it('falls back to per-task boundaries when an oversized subsection is still over the limit', async () => {
    // A section 'A' with 3 tasks. `bySubsection` splits it into 'A > one'
    // (task 1 alone) and 'A > two' (tasks 2-3), but 'A > two' is itself
    // still over the limit and has no subsections of its own — so it must
    // fall back a second level, to per-task boundaries within just that
    // subsection.
    const big = group(
      'A',
      checkpoint(1, 'A'),
      checkpoint(2, 'A'),
      checkpoint(3, 'A'),
    );
    const subsectionOne = group('A > one', checkpoint(1, 'A'));
    const subsectionTwo = group(
      'A > two',
      checkpoint(2, 'A'),
      checkpoint(3, 'A'),
    );
    const taskTwo = group('A > two (task 2)', checkpoint(2, 'A'));
    const taskThree = group('A > two (task 3)', checkpoint(3, 'A'));

    grouping.bySubsection.mockImplementation((g: CheckpointGroup) =>
      g.label === 'A' ? [subsectionOne, subsectionTwo] : [g],
    );
    grouping.byTask.mockImplementation((g: CheckpointGroup) =>
      g.label === 'A > two' ? [taskTwo, taskThree] : [g],
    );
    counts({
      'origin/main...sha3': 300,
      'origin/main...sha1': 50,
      'sha1...sha3': 250,
      'sha1...sha2': 100,
      'sha2...sha3': 90,
    });

    await expect(service.pack([big], 'origin/main')).resolves.toEqual({
      packed: [
        { sectionsCovered: ['A > one'], commitSha: 'sha1', fileCount: 50 },
        {
          sectionsCovered: ['A > two (task 2)'],
          commitSha: 'sha2',
          fileCount: 100,
        },
        {
          sectionsCovered: ['A > two (task 3)'],
          commitSha: 'sha3',
          fileCount: 90,
        },
      ],
    });
    expect(grouping.byTask).toHaveBeenCalledWith(subsectionTwo);
  });

  it('reports the offending task when a single task exceeds the limit on its own', async () => {
    const only = group('A', checkpoint(1, 'A'));
    grouping.bySubsection.mockReturnValue([only]);
    grouping.byTask.mockReturnValue([only]);
    counts({ 'origin/main...sha1': 400 });

    await expect(service.pack([only], 'origin/main')).resolves.toEqual({
      unsplittable: { taskNumber: 1, label: 'A', fileCount: 400 },
    });
  });

  it('propagates an unsplittable task found while subdividing a later section', async () => {
    const big = group('B', checkpoint(2, 'B'));
    grouping.bySubsection.mockReturnValue([big]);
    grouping.byTask.mockReturnValue([big]);
    counts({
      'origin/main...sha1': 100,
      'origin/main...sha2': 300,
      'sha1...sha2': 200,
    });

    await expect(service.pack([sectionA, big], 'origin/main')).resolves.toEqual(
      {
        unsplittable: { taskNumber: 2, label: 'B', fileCount: 200 },
      },
    );
  });
});
