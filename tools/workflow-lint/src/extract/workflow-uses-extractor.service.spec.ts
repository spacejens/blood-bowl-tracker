import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkflowUsesExtractorService } from './workflow-uses-extractor.service';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

function yaml(lines: readonly string[]): string {
  return lines.join('\n') + '\n';
}

describe('WorkflowUsesExtractorService', () => {
  let service: WorkflowUsesExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WorkflowUsesExtractorService],
    }).compile();
    service = moduleRef.get(WorkflowUsesExtractorService);
  });

  it('returns step-level uses values with their line numbers, without trailing comments', () => {
    const source = yaml([
      'name: CI', // 1
      'on: pull_request', // 2
      'jobs:', // 3
      '  lint:', // 4
      '    runs-on: ubuntu-latest', // 5
      '    steps:', // 6
      `      - uses: actions/checkout@${SHA} # v7`, // 7
      '        with:', // 8
      '          persist-credentials: false', // 9
      '      - name: Install', // 10
      '        run: pnpm install', // 11
      '      - uses: actions/setup-node@v7', // 12
    ]);

    expect(service.extract(source)).toEqual([
      { uses: `actions/checkout@${SHA}`, line: 7 },
      { uses: 'actions/setup-node@v7', line: 12 },
    ]);
  });

  it('returns job-level reusable workflow references', () => {
    const source = yaml([
      'jobs:', // 1
      '  call:', // 2
      '    uses: octo-org/shared/.github/workflows/build.yml@v1', // 3
      '  local:', // 4
      '    uses: ./.github/workflows/reusable.yml', // 5
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'octo-org/shared/.github/workflows/build.yml@v1', line: 3 },
      { uses: './.github/workflows/reusable.yml', line: 5 },
    ]);
  });

  it('collects across several jobs in document order', () => {
    const source = yaml([
      'jobs:', // 1
      '  build:', // 2
      '    steps:', // 3
      '      - uses: actions/checkout@v7', // 4
      '  reuse:', // 5
      '    uses: ./.github/workflows/reusable.yml', // 6
      '  test:', // 7
      '    steps:', // 8
      '      - uses: docker://alpine:3.20', // 9
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'actions/checkout@v7', line: 4 },
      { uses: './.github/workflows/reusable.yml', line: 6 },
      { uses: 'docker://alpine:3.20', line: 9 },
    ]);
  });

  it('returns nothing for a workflow whose steps only run commands', () => {
    const source = yaml([
      'jobs:',
      '  hello:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo hello',
    ]);

    expect(service.extract(source)).toEqual([]);
  });

  it('returns nothing for an empty file or one without jobs', () => {
    expect(service.extract('')).toEqual([]);
    expect(service.extract(yaml(['name: no jobs here']))).toEqual([]);
    expect(service.extract(yaml(['- a', '- list']))).toEqual([]);
  });

  it('ignores uses keys outside jobs.<job>.uses and jobs.<job>.steps[].uses', () => {
    const source = yaml([
      'uses: top-level/ignored@v1',
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: With a nested uses',
      '        with:',
      '          uses: nested/ignored@v1',
    ]);

    expect(service.extract(source)).toEqual([]);
  });

  it('skips structure GitHub itself would reject instead of failing on it', () => {
    const source = yaml([
      'jobs:',
      '  not-a-map: just a string',
      '  steps-not-a-list:',
      '    steps: oops',
      '  step-not-a-map:',
      '    steps:',
      '      - just-a-string',
      '  uses-not-a-scalar:',
      '    uses: [a, b]',
    ]);

    expect(service.extract(source)).toEqual([]);
  });

  it('reports non-string uses values as their raw source text', () => {
    const source = yaml([
      'jobs:', // 1
      '  empty:', // 2
      '    uses:', // 3
      '    runs-on: ubuntu-latest', // 4
      '  tilde:', // 5
      '    uses: ~', // 6
      '  number:', // 7
      '    steps:', // 8
      '      - uses: 123', // 9
      '      - uses: true', // 10
      '      - uses:', // 11
      '        name: after empty', // 12
    ]);

    expect(service.extract(source)).toEqual([
      { uses: '', line: 3 },
      { uses: '~', line: 6 },
      { uses: '123', line: 9 },
      { uses: 'true', line: 10 },
      { uses: '', line: 11 },
    ]);
  });

  it('keeps line numbers right for a quoted uses after a multi-line run block', () => {
    const source = yaml([
      'jobs:', // 1
      '  build:', // 2
      '    steps:', // 3
      '      - run: |', // 4
      '          echo one', // 5
      '          echo two', // 6
      '', // 7
      '      - uses: "actions/checkout@v7"', // 8
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'actions/checkout@v7', line: 8 },
    ]);
  });

  it('returns nothing when jobs is not a map', () => {
    expect(service.extract(yaml(['jobs: []']))).toEqual([]);
  });

  it('throws on invalid YAML', () => {
    expect(() => service.extract(yaml(['jobs:', '  lint: [unclosed']))).toThrow(
      /^Invalid YAML: /,
    );
  });

  it('throws on duplicate keys, which YAML forbids', () => {
    expect(() =>
      service.extract(yaml(['jobs:', '  a: {}', '  a: {}'])),
    ).toThrow(/^Invalid YAML: /);
  });
});
