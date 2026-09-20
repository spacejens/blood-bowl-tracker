import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  COMPUTE_PR_SPLIT_USAGE,
  ComputePrSplitArgsService,
} from './compute-pr-split-args.service';

describe('ComputePrSplitArgsService', () => {
  let service: ComputePrSplitArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ComputePrSplitArgsService],
    }).compile();
    service = moduleRef.get(ComputePrSplitArgsService);
  });

  const argv = (...flags: string[]): string[] => [
    'node',
    'main.js',
    'compute-pr-split',
    ...flags,
  ];

  const checkpoints = JSON.stringify([
    { taskNumber: 1, sectionPath: ['Detection'], commitSha: 'aaaaaaa' },
    {
      taskNumber: 2,
      sectionPath: ['Detection', 'Algorithm'],
      commitSha: 'bbbbbbb',
    },
  ]);

  it('defaults both refs and parses the checkpoint list', () => {
    expect(service.parse(argv(), checkpoints)).toEqual({
      baseRef: 'origin/main',
      headRef: 'HEAD',
      checkpoints: [
        { taskNumber: 1, sectionPath: ['Detection'], commitSha: 'aaaaaaa' },
        {
          taskNumber: 2,
          sectionPath: ['Detection', 'Algorithm'],
          commitSha: 'bbbbbbb',
        },
      ],
    });
  });

  it('accepts explicit --base-ref and --head-ref overrides', () => {
    expect(
      service.parse(argv('--base-ref=main', '--head-ref=abc1234'), checkpoints),
    ).toMatchObject({ baseRef: 'main', headRef: 'abc1234' });
  });

  it('rejects an unknown flag', () => {
    expect(() => service.parse(argv('--nope=1'), checkpoints)).toThrow(
      COMPUTE_PR_SPLIT_USAGE,
    );
  });

  it('rejects an empty flag value', () => {
    expect(() => service.parse(argv('--base-ref='), checkpoints)).toThrow(
      COMPUTE_PR_SPLIT_USAGE,
    );
  });

  it('rejects malformed JSON on stdin', () => {
    expect(() => service.parse(argv(), 'not json')).toThrow('bad JSON');
  });

  it('rejects an empty checkpoint list', () => {
    expect(() => service.parse(argv(), '[]')).toThrow('unexpected shape');
  });

  it('rejects a checkpoint with a bad commit sha', () => {
    const bad = JSON.stringify([
      { taskNumber: 1, sectionPath: ['A'], commitSha: 'zzz' },
    ]);
    expect(() => service.parse(argv(), bad)).toThrow('unexpected shape');
  });

  it('rejects a checkpoint nested deeper than a subsection', () => {
    const bad = JSON.stringify([
      { taskNumber: 1, sectionPath: ['A', 'B', 'C'], commitSha: 'aaaaaaa' },
    ]);
    expect(() => service.parse(argv(), bad)).toThrow('unexpected shape');
  });
});
