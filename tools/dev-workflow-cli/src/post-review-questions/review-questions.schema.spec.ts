import { describe, expect, it } from 'vitest';

import { reviewQuestionsSchema } from './review-questions.schema';

describe('reviewQuestionsSchema', () => {
  it('accepts a list of questions', () => {
    expect(
      reviewQuestionsSchema.parse([
        { file: 'src/a.ts', line: 12, body: 'Why?' },
      ]),
    ).toEqual([{ file: 'src/a.ts', line: 12, body: 'Why?' }]);
  });

  it('accepts an empty list', () => {
    expect(reviewQuestionsSchema.parse([])).toEqual([]);
  });

  it('reports a root-level issue when the value is not an array', () => {
    const result = reviewQuestionsSchema.safeParse({ file: 'a' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([]);
  });

  it('reports the failing element index for a bad question', () => {
    for (const bad of [
      { file: '', line: 1, body: 'b' },
      { file: 'a', line: 0, body: 'b' },
      { file: 'a', line: 1.5, body: 'b' },
      { file: 'a', line: 1, body: '' },
      { file: 'a', line: '1', body: 'b' },
      'nope',
    ]) {
      const result = reviewQuestionsSchema.safeParse([
        { file: 'ok.ts', line: 1, body: 'ok' },
        bad,
      ]);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path[0]).toBe(1);
    }
  });

  it('drops keys the questions do not declare', () => {
    expect(
      reviewQuestionsSchema.parse([
        { file: 'a', line: 1, body: 'b', extra: true },
      ])[0],
    ).toEqual({ file: 'a', line: 1, body: 'b' });
  });
});
