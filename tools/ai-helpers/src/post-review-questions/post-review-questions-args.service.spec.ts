import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PostReviewQuestionsArgsService } from './post-review-questions-args.service';

/** argv as node builds it: [node, script, subcommand, ...arguments]. */
function argv(...args: string[]): string[] {
  return ['node', 'dist/main.js', 'post-review-questions', ...args];
}

describe('PostReviewQuestionsArgsService', () => {
  let service: PostReviewQuestionsArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PostReviewQuestionsArgsService],
    }).compile();
    service = moduleRef.get(PostReviewQuestionsArgsService);
  });

  it('reads a single question', () => {
    const stdin = JSON.stringify([
      { file: 'src/foo.ts', line: 10, body: 'consider renaming this' },
    ]);
    expect(service.parse(argv('392'), stdin)).toEqual({
      prNumber: '392',
      questions: [
        { file: 'src/foo.ts', line: 10, body: 'consider renaming this' },
      ],
    });
  });

  it('reads multiple questions', () => {
    const stdin = JSON.stringify([
      { file: 'src/foo.ts', line: 10, body: 'question one' },
      { file: 'src/bar.ts', line: 22, body: 'question two' },
    ]);
    expect(service.parse(argv('392'), stdin)).toEqual({
      prNumber: '392',
      questions: [
        { file: 'src/foo.ts', line: 10, body: 'question one' },
        { file: 'src/bar.ts', line: 22, body: 'question two' },
      ],
    });
  });

  it('accepts an empty array', () => {
    expect(service.parse(argv('392'), '[]')).toEqual({
      prNumber: '392',
      questions: [],
    });
  });

  it.each([[[]], [['0']], [['abc']], [['-5']], [['01']]])(
    'rejects a bad PR argument %j',
    (args) => {
      expect(() => service.parse(argv(...args), '[]')).toThrow(/Usage:/);
    },
  );

  it('rejects an unexpected extra positional argument after the PR number', () => {
    expect(() => service.parse(argv('392', 'unexpected'), '[]')).toThrow(
      /Usage:/,
    );
  });

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

  it('rejects a question missing file', () => {
    const stdin = JSON.stringify([{ line: 1, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('rejects a question with empty-string file', () => {
    const stdin = JSON.stringify([{ file: '', line: 1, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('rejects a question with line as a string', () => {
    const stdin = JSON.stringify([{ file: 'a', line: '1', body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('rejects a question with line zero', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 0, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('rejects a question with a fractional line', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 1.5, body: 'b' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('rejects a question missing body', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 1 }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('rejects a question with empty-string body', () => {
    const stdin = JSON.stringify([{ file: 'a', line: 1, body: '' }]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it.each([
    ['a null element', null],
    ['file as a number', { file: 1, line: 1, body: 'b' }],
    ['body as a number', { file: 'a', line: 1, body: 1 }],
    ['a negative line', { file: 'a', line: -1, body: 'b' }],
  ])('rejects a question with %s', (_description, element) => {
    const stdin = JSON.stringify([element]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 0\)/s,
    );
  });

  it('reports the correct index for a bad question beyond the first', () => {
    const stdin = JSON.stringify([
      { file: 'a', line: 1, body: 'ok' },
      { file: 'a', line: 0, body: 'bad' },
    ]);
    expect(() => service.parse(argv('392'), stdin)).toThrow(
      /Usage:.*\(bad question at index 1\)/s,
    );
  });
});
