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

  it('resolves an aliased uses to its unpinned value, at the alias line', () => {
    const source = yaml([
      'env:', // 1
      '  X: &co actions/checkout@v7', // 2
      'jobs:', // 3
      '  a:', // 4
      '    steps:', // 5
      '      - uses: *co', // 6
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'actions/checkout@v7', line: 6 },
    ]);
  });

  it('resolves an aliased uses to its pinned value so it can pass', () => {
    const source = yaml([
      'env:', // 1
      `  X: &co actions/checkout@${SHA}`, // 2
      'jobs:', // 3
      '  a:', // 4
      '    steps:', // 5
      '      - uses: *co', // 6
    ]);

    expect(service.extract(source)).toEqual([
      { uses: `actions/checkout@${SHA}`, line: 6 },
    ]);
  });

  it('follows a whole step given as an alias', () => {
    const source = yaml([
      'x-step: &st', // 1
      '  uses: actions/setup-node@v7', // 2
      'jobs:', // 3
      '  a:', // 4
      '    steps:', // 5
      '      - *st', // 6
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'actions/setup-node@v7', line: 6 },
    ]);
  });

  it('follows a steps list given as an alias', () => {
    const source = yaml([
      'x-steps: &s', // 1
      '  - uses: actions/checkout@v7', // 2
      'jobs:', // 3
      '  a:', // 4
      '    steps: *s', // 5
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'actions/checkout@v7', line: 5 },
    ]);
  });

  it('follows a job given as an alias', () => {
    const source = yaml([
      'x-job: &j', // 1
      '  uses: octo-org/shared/.github/workflows/build.yml@v1', // 2
      'jobs:', // 3
      '  a: *j', // 4
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'octo-org/shared/.github/workflows/build.yml@v1', line: 4 },
    ]);
  });

  it('skips an alias that resolves to something that is not a step', () => {
    const source = yaml([
      'x: &n 5', // 1
      'jobs:', // 2
      '  a:', // 3
      '    steps:', // 4
      '      - *n', // 5
    ]);

    expect(service.extract(source)).toEqual([]);
  });

  it('reports a jobs map given as an alias at the alias line', () => {
    const source = yaml([
      'x-jobs: &js', // 1
      '  a:', // 2
      '    uses: octo-org/shared/.github/workflows/build.yml@v1', // 3
      '  b:', // 4
      '    steps:', // 5
      '      - uses: actions/checkout@v7', // 6
      'jobs: *js', // 7
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'octo-org/shared/.github/workflows/build.yml@v1', line: 7 },
      { uses: 'actions/checkout@v7', line: 7 },
    ]);
  });

  it('follows an alias nested inside aliased content, at the outer alias line', () => {
    const source = yaml([
      'x-step: &st', // 1
      '  uses: actions/setup-node@v7', // 2
      'x-steps: &s', // 3
      '  - *st', // 4
      'jobs:', // 5
      '  a:', // 6
      '    steps: *s', // 7
    ]);

    expect(service.extract(source)).toEqual([
      { uses: 'actions/setup-node@v7', line: 7 },
    ]);
  });

  it('reports an aliased non-string uses as its raw text, at the alias line', () => {
    const source = yaml([
      'x: &n ~', // 1
      'jobs:', // 2
      '  a:', // 3
      '    steps:', // 4
      '      - uses: *n', // 5
    ]);

    expect(service.extract(source)).toEqual([{ uses: '~', line: 5 }]);
  });

  it('throws on an alias to an undefined anchor, with its line', () => {
    const source = yaml([
      'jobs:', // 1
      '  a:', // 2
      '    steps:', // 3
      '      - uses: *nope', // 4
    ]);

    expect(() => service.extract(source)).toThrow(
      'Invalid YAML: unresolved alias *nope at line 4',
    );
  });

  it('throws on an undefined anchor at the jobs, job and steps positions', () => {
    expect(() => service.extract(yaml(['jobs: *nope']))).toThrow(
      'Invalid YAML: unresolved alias *nope at line 1',
    );
    expect(() => service.extract(yaml(['jobs:', '  a: *nope']))).toThrow(
      'Invalid YAML: unresolved alias *nope at line 2',
    );
    expect(() =>
      service.extract(yaml(['jobs:', '  a:', '    steps: *nope'])),
    ).toThrow('Invalid YAML: unresolved alias *nope at line 3');
    expect(() =>
      service.extract(yaml(['jobs:', '  a:', '    steps:', '      - *nope'])),
    ).toThrow('Invalid YAML: unresolved alias *nope at line 4');
  });

  it('throws on a merge key in a step, which would hide a uses', () => {
    const source = yaml([
      'x-base: &base', // 1
      '  uses: actions/checkout@v7', // 2
      'jobs:', // 3
      '  a:', // 4
      '    steps:', // 5
      '      - <<: *base', // 6
    ]);

    expect(() => service.extract(source)).toThrow(
      'Unsupported YAML: merge key (<<) at line 6; list uses: values explicitly',
    );
  });

  it('throws on a merge key in a job, which would hide steps', () => {
    const source = yaml([
      'x-base: &base', // 1
      '  steps:', // 2
      '    - uses: actions/checkout@v7', // 3
      'jobs:', // 4
      '  a:', // 5
      '    runs-on: ubuntu-latest', // 6
      '    <<: *base', // 7
    ]);

    expect(() => service.extract(source)).toThrow(
      'Unsupported YAML: merge key (<<) at line 7; list uses: values explicitly',
    );
  });

  it('throws on an alias used as a mapping key in a step', () => {
    const source = yaml([
      'x-key: &k uses', // 1
      'jobs:', // 2
      '  a:', // 3
      '    steps:', // 4
      '      - *k : actions/checkout@v7', // 5
    ]);

    expect(() => service.extract(source)).toThrow(
      'Unsupported YAML: alias used as a mapping key at line 5',
    );
  });

  it('throws on an alias used as the steps or jobs key', () => {
    expect(() =>
      service.extract(
        yaml(['x-key: &k steps', 'jobs:', '  a:', '    *k : []']),
      ),
    ).toThrow('Unsupported YAML: alias used as a mapping key at line 4');
    expect(() =>
      service.extract(yaml(['x-key: &k a', 'jobs:', '  *k : {}'])),
    ).toThrow('Unsupported YAML: alias used as a mapping key at line 3');
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
