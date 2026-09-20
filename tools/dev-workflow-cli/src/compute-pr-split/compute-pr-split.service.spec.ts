import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ComputePrSplitService } from './compute-pr-split.service';
import { DiffFileCountService } from './diff-file-count.service';
import { TaskCheckpoint } from './pr-split-checkpoints.schema';
import { PrSplitPackingService } from './pr-split-packing.service';
import {
  CheckpointGroup,
  TaskCheckpointGroupingService,
} from './task-checkpoint-grouping.service';

describe('ComputePrSplitService', () => {
  let service: ComputePrSplitService;
  let grouping: MockProxy<TaskCheckpointGroupingService>;
  let packing: MockProxy<PrSplitPackingService>;
  let fileCount: MockProxy<DiffFileCountService>;

  beforeEach(async () => {
    grouping = mock<TaskCheckpointGroupingService>();
    packing = mock<PrSplitPackingService>();
    fileCount = mock<DiffFileCountService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComputePrSplitService,
        { provide: TaskCheckpointGroupingService, useValue: grouping },
        { provide: PrSplitPackingService, useValue: packing },
        { provide: DiffFileCountService, useValue: fileCount },
      ],
    }).compile();
    service = moduleRef.get(ComputePrSplitService);
  });

  const checkpoints: TaskCheckpoint[] = [
    { taskNumber: 1, sectionPath: ['A'], commitSha: 'sha1' },
    { taskNumber: 2, sectionPath: ['B'], commitSha: 'sha2' },
  ];
  const input = { baseRef: 'origin/main', headRef: 'HEAD', checkpoints };
  const sections: CheckpointGroup[] = [
    { label: 'A', commitSha: 'sha1', checkpoints: [checkpoints[0]] },
    { label: 'B', commitSha: 'sha2', checkpoints: [checkpoints[1]] },
  ];

  it('reports a single part and never packs when the branch fits', async () => {
    grouping.byTopLevelSection.mockReturnValue(sections);
    fileCount.count.mockResolvedValue(42);

    await expect(service.run(input)).resolves.toEqual({
      limit: 130,
      totalFileCount: 42,
      splitNeeded: false,
      parts: [
        {
          partNumber: 1,
          sectionsCovered: ['A', 'B'],
          commitSha: 'HEAD',
          fileCount: 42,
        },
      ],
    });
    expect(packing.pack).not.toHaveBeenCalled();
    expect(fileCount.count).toHaveBeenCalledWith('origin/main', 'HEAD');
  });

  it('numbers packed parts and re-measures the last part up to the branch tip', async () => {
    grouping.byTopLevelSection.mockReturnValue(sections);
    fileCount.count.mockImplementation((from: string, to: string) =>
      Promise.resolve(from === 'origin/main' && to === 'HEAD' ? 200 : 75),
    );
    packing.pack.mockResolvedValue({
      packed: [
        { sectionsCovered: ['A'], commitSha: 'sha1', fileCount: 120 },
        { sectionsCovered: ['B'], commitSha: 'sha2', fileCount: 70 },
      ],
    });

    await expect(service.run(input)).resolves.toEqual({
      limit: 130,
      totalFileCount: 200,
      splitNeeded: true,
      parts: [
        {
          partNumber: 1,
          sectionsCovered: ['A'],
          commitSha: 'sha1',
          fileCount: 120,
        },
        {
          partNumber: 2,
          sectionsCovered: ['B'],
          commitSha: 'HEAD',
          fileCount: 75,
        },
      ],
    });
    expect(packing.pack).toHaveBeenCalledWith(sections, 'origin/main');
    expect(fileCount.count).toHaveBeenCalledWith('sha1', 'HEAD');
  });

  it('reports unsplittableWholeBranch when the last of two-or-more packed parts is still over the limit after remeasurement', async () => {
    grouping.byTopLevelSection.mockReturnValue(sections);
    fileCount.count.mockImplementation((from: string, to: string) =>
      Promise.resolve(from === 'origin/main' && to === 'HEAD' ? 250 : 150),
    );
    packing.pack.mockResolvedValue({
      packed: [
        { sectionsCovered: ['A'], commitSha: 'sha1', fileCount: 100 },
        { sectionsCovered: ['B'], commitSha: 'sha2', fileCount: 70 },
      ],
    });

    await expect(service.run(input)).resolves.toEqual({
      limit: 130,
      totalFileCount: 250,
      splitNeeded: true,
      parts: [],
      unsplittableWholeBranch: { fileCount: 150 },
    });
    expect(fileCount.count).toHaveBeenCalledWith('sha1', 'HEAD');
  });

  it('reports unsplittableWholeBranch when packing yields only one part still over the limit', async () => {
    grouping.byTopLevelSection.mockReturnValue(sections);
    fileCount.count.mockResolvedValue(140);
    packing.pack.mockResolvedValue({
      packed: [
        { sectionsCovered: ['A', 'B'], commitSha: 'sha2', fileCount: 135 },
      ],
    });

    await expect(service.run(input)).resolves.toEqual({
      limit: 130,
      totalFileCount: 140,
      splitNeeded: true,
      parts: [],
      unsplittableWholeBranch: { fileCount: 140 },
    });
    expect(fileCount.count).toHaveBeenCalledWith('origin/main', 'HEAD');
  });

  it('throws an internal-invariant error if packing ever returns zero boundaries', async () => {
    grouping.byTopLevelSection.mockReturnValue(sections);
    fileCount.count.mockResolvedValue(140);
    packing.pack.mockResolvedValue({ packed: [] });

    await expect(service.run(input)).rejects.toThrow(
      'pack() returned no boundaries',
    );
  });

  it('returns no parts and the offending task when the split is impossible', async () => {
    grouping.byTopLevelSection.mockReturnValue(sections);
    fileCount.count.mockResolvedValue(300);
    packing.pack.mockResolvedValue({
      unsplittable: { taskNumber: 2, label: 'B', fileCount: 200 },
    });

    await expect(service.run(input)).resolves.toEqual({
      limit: 130,
      totalFileCount: 300,
      splitNeeded: true,
      parts: [],
      unsplittable: { taskNumber: 2, label: 'B', fileCount: 200 },
    });
  });
});
