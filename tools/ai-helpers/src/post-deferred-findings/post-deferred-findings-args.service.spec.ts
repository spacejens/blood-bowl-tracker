import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PostDeferredFindingsArgsService } from './post-deferred-findings-args.service';

/** argv as node builds it: [node, script, subcommand, ...arguments]. */
function argv(...args: string[]): string[] {
  return ['node', 'dist/main.js', 'post-deferred-findings', ...args];
}

describe('PostDeferredFindingsArgsService', () => {
  let service: PostDeferredFindingsArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PostDeferredFindingsArgsService],
    }).compile();
    service = moduleRef.get(PostDeferredFindingsArgsService);
  });

  it('reads a single finding', () => {
    const stdin = JSON.stringify([
      { file: 'src/foo.ts', line: 10, body: 'consider renaming this' },
    ]);
    expect(service.parse(argv('392'), stdin)).toEqual({
      prNumber: '392',
      findings: [
        { file: 'src/foo.ts', line: 10, body: 'consider renaming this' },
      ],
    });
  });

  it('reads multiple findings', () => {
    const stdin = JSON.stringify([
      { file: 'src/foo.ts', line: 10, body: 'finding one' },
      { file: 'src/bar.ts', line: 22, body: 'finding two' },
    ]);
    expect(service.parse(argv('392'), stdin)).toEqual({
      prNumber: '392',
      findings: [
        { file: 'src/foo.ts', line: 10, body: 'finding one' },
        { file: 'src/bar.ts', line: 22, body: 'finding two' },
      ],
    });
  });

  it('accepts an empty array', () => {
    expect(service.parse(argv('392'), '[]')).toEqual({
      prNumber: '392',
      findings: [],
    });
  });

  it.each([[[]], [['0']], [['abc']], [['-5']], [['01']]])(
    'rejects a bad PR argument %j',
    (args) => {
      expect(() => service.parse(argv(...args), '[]')).toThrow(/Usage:/);
    },
  );

  it('rejects empty stdin', () => {
    expect(() => service.parse(argv('392'), '')).toThrow(
      /Usage:.*\(bad JSON\)/s,
    );
  });

  it('rejects malformed JSON', () => {
    expect(() => service.parse(argv('392'), '{not json')).toThrow(
      /Usage:.*\(bad JSON\)/s,
    );
  });

  it('rejects a JSON object instead of an array', () => {
    expect(() =>
      service.parse(
        argv('392'),
        JSON.stringify({ file: 'a', line: 1, body: 'b' }),
      ),
    ).toThrow(/Usage:.*\(not an array\)/s);
  });

  it('rejects a finding missing file', () => {
    const stdin = JSON.stringify([{ line: 1, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('rejects a finding with empty-string file', () => {
    const stdin = JSON.stringify([{ file: '', line: 1, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('rejects a finding with line as a string', () => {
    const stdin = JSON.stringify([{ file: 'a', line: '1', body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('rejects a finding with line zero', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 0, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('rejects a finding with a fractional line', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 1.5, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('rejects a finding missing body', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 1 }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('rejects a finding with empty-string body', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 1, body: '' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it.each([
    ['a null element', null],
    ['file as a number', { file: 1, line: 1, body: 'b' }],
    ['body as a number', { file: 'a', line: 1, body: 1 }],
    ['a negative line', { file: 'a', line: -1, body: 'b' }],
  ])('rejects a finding with %s', (_description, element) => {
    const stdin = JSON.stringify([element]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 0\)/s,
    );
  });

  it('reports the correct index for a bad finding beyond the first', () => {
    const stdin = JSON.stringify([
      { file: 'a', line: 1, body: 'ok' },
      { file: 'a', line: 0, body: 'bad' },
    ]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad finding at index 1\)/s,
    );
  });
});
