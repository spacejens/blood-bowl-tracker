import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkflowJobReaderService } from './workflow-job-reader.service';

describe('WorkflowJobReaderService', () => {
  let service: WorkflowJobReaderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WorkflowJobReaderService],
    }).compile();
    service = moduleRef.get(WorkflowJobReaderService);
  });

  it('returns the job environment and each step in order', () => {
    const source = [
      'jobs:',
      '  build:',
      '    environment: production',
      '    steps:',
      '      - uses: actions/checkout@abc',
      '      - name: Run it',
      '        env:',
      '          A: ${{ vars.A }}',
      '          B: plain',
      '        run: |',
      '          echo "$A"',
      '',
    ].join('\n');

    expect(service.readJob(source, 'build')).toEqual({
      environment: 'production',
      steps: [
        { uses: 'actions/checkout@abc', env: {} },
        {
          name: 'Run it',
          run: 'echo "$A"\n',
          env: { A: '${{ vars.A }}', B: 'plain' },
        },
      ],
    });
  });

  it('reads the name of an environment given as a mapping', () => {
    const source = [
      'jobs:',
      '  deploy:',
      '    environment:',
      '      name: staging',
      '      url: https://example.com',
      '    steps: []',
      '',
    ].join('\n');

    expect(service.readJob(source, 'deploy').environment).toBe('staging');
  });

  it('leaves the environment undefined when the job has none', () => {
    const source = 'jobs:\n  a:\n    steps: []\n';

    expect(service.readJob(source, 'a')).toEqual({
      environment: undefined,
      steps: [],
    });
  });

  it('ignores non-string step fields and env values, and non-mapping steps', () => {
    const source = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - name: 3',
      '        env:',
      '          N: 1',
      '          S: text',
      '      - just-a-string',
      '',
    ].join('\n');

    expect(service.readJob(source, 'a').steps).toEqual([
      { env: { S: 'text' } },
      { env: {} },
    ]);
  });

  it('fails, naming the job, when the job is missing', () => {
    expect(() => service.readJob('jobs:\n  a:\n    steps: []\n', 'b')).toThrow(
      "Job 'b' not found",
    );
  });

  it('fails when the document has no jobs mapping', () => {
    expect(() => service.readJob('name: x\n', 'a')).toThrow(
      "Job 'a' not found",
    );
  });

  it('fails, naming the job, when it has no steps list', () => {
    expect(() =>
      service.readJob('jobs:\n  a:\n    uses: ./x.yml\n', 'a'),
    ).toThrow("Job 'a' has no steps list");
  });
});
