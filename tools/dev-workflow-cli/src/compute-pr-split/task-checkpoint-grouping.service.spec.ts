import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TaskCheckpoint } from './pr-split-checkpoints.schema';
import { TaskCheckpointGroupingService } from './task-checkpoint-grouping.service';

describe('TaskCheckpointGroupingService', () => {
  let service: TaskCheckpointGroupingService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TaskCheckpointGroupingService],
    }).compile();
    service = moduleRef.get(TaskCheckpointGroupingService);
  });

  const checkpoint = (
    taskNumber: number,
    sectionPath: string[],
  ): TaskCheckpoint => ({
    taskNumber,
    sectionPath,
    commitSha: `sha${String(taskNumber)}`,
  });

  it('groups consecutive tasks of one section, ending at its last commit', () => {
    const groups = service.byTopLevelSection([
      checkpoint(1, ['Data model']),
      checkpoint(2, ['Data model', 'Schema']),
      checkpoint(3, ['Display']),
    ]);

    expect(groups).toEqual([
      {
        label: 'Data model',
        commitSha: 'sha2',
        checkpoints: [
          checkpoint(1, ['Data model']),
          checkpoint(2, ['Data model', 'Schema']),
        ],
      },
      {
        label: 'Display',
        commitSha: 'sha3',
        checkpoints: [checkpoint(3, ['Display'])],
      },
    ]);
  });

  it('starts a new group when a section name reappears after another', () => {
    const groups = service.byTopLevelSection([
      checkpoint(1, ['A']),
      checkpoint(2, ['B']),
      checkpoint(3, ['A']),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['A', 'B', 'A']);
  });

  it('splits a section into its subsections, labelling section and subsection', () => {
    const [section] = service.byTopLevelSection([
      checkpoint(1, ['Data model', 'Schema']),
      checkpoint(2, ['Data model', 'Schema']),
      checkpoint(3, ['Data model', 'Import']),
    ]);

    expect(service.bySubsection(section)).toEqual([
      {
        label: 'Data model > Schema',
        commitSha: 'sha2',
        checkpoints: [
          checkpoint(1, ['Data model', 'Schema']),
          checkpoint(2, ['Data model', 'Schema']),
        ],
      },
      {
        label: 'Data model > Import',
        commitSha: 'sha3',
        checkpoints: [checkpoint(3, ['Data model', 'Import'])],
      },
    ]);
  });

  it('returns one group unchanged for a section with no subsections', () => {
    const [section] = service.byTopLevelSection([
      checkpoint(1, ['Display']),
      checkpoint(2, ['Display']),
    ]);

    expect(service.bySubsection(section)).toEqual([section]);
  });

  it('splits a group into one labelled group per task', () => {
    const [section] = service.byTopLevelSection([
      checkpoint(1, ['Display']),
      checkpoint(2, ['Display']),
    ]);

    expect(service.byTask(section)).toEqual([
      {
        label: 'Display (task 1)',
        commitSha: 'sha1',
        checkpoints: [checkpoint(1, ['Display'])],
      },
      {
        label: 'Display (task 2)',
        commitSha: 'sha2',
        checkpoints: [checkpoint(2, ['Display'])],
      },
    ]);
  });
});
