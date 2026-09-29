import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ErrorListFitService } from './error-list-fit.service';

/** Length of lines joined one per line, as the consumers render them. */
const joined = (lines: string[]) => lines.join('\n').length;

describe('ErrorListFitService', () => {
  let service: ErrorListFitService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ErrorListFitService],
    }).compile();
    service = moduleRef.get(ErrorListFitService);
  });

  it('returns the lines unchanged when they all fit', () => {
    const lines = ['- aaaa', '- bbbb'];

    expect(service.fit(lines, joined(lines))).toEqual(lines);
  });

  it('returns an empty list unchanged', () => {
    expect(service.fit([], 0)).toEqual([]);
  });

  it('keeps as many leading lines as fit alongside a note counting the rest', () => {
    const lines = ['a', 'b', 'c', 'd'].map((c) => c.repeat(40));
    const note = '…and 2 more errors not shown.';

    expect(service.fit(lines, joined([lines[0], lines[1], note]))).toEqual([
      lines[0],
      lines[1],
      note,
    ]);
  });

  it('drops a further line when the note would not fit after it', () => {
    const lines = ['a', 'b', 'c', 'd'].map((c) => c.repeat(40));
    const budget =
      joined([lines[0], lines[1], '…and 2 more errors not shown.']) - 1;

    expect(service.fit(lines, budget)).toEqual([
      lines[0],
      '…and 3 more errors not shown.',
    ]);
  });

  it('says "error" when exactly one was left out', () => {
    const lines = ['a', 'b'].map((c) => c.repeat(40));
    const note = '…and 1 more error not shown.';

    expect(service.fit(lines, joined([lines[0], note]))).toEqual([
      lines[0],
      note,
    ]);
  });

  it('keeps the first line alone when the budget has no room for a stub and the note', () => {
    expect(service.fit(['aaaa', 'bbbb'], 6)).toEqual(['aaaa']);
  });

  it('shortens a first line that fits whole so the note still follows it', () => {
    const lines = ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60)];
    const note = '…and 2 more errors not shown.';
    const budget = 70;

    const result = service.fit(lines, budget);

    expect(result).toEqual([`${'a'.repeat(budget - note.length - 2)}…`, note]);
    expect(joined(result)).toBe(budget);
  });

  it('shortens an over-long first line so the count of the rest is still shown', () => {
    const lines = ['x'.repeat(5000), ...Array.from({ length: 49 }, () => 'y')];
    const note = '…and 49 more errors not shown.';

    const result = service.fit(lines, 200);

    expect(result).toEqual([`${'x'.repeat(200 - note.length - 2)}…`, note]);
    expect(joined(result)).toBeLessThanOrEqual(200);
  });

  it('uses the singular note when shortening the first line of a two-line list', () => {
    const note = '…and 1 more error not shown.';

    const result = service.fit(['x'.repeat(100), 'y'.repeat(100)], 50);

    expect(result).toEqual([`${'x'.repeat(50 - note.length - 2)}…`, note]);
    expect(joined(result)).toBeLessThanOrEqual(50);
  });

  it('requires at least one stub character before the ellipsis', () => {
    const note = '…and 1 more error not shown.';

    expect(service.fit(['x'.repeat(100), 'y'], note.length + 3)).toEqual([
      `x…`,
      note,
    ]);
    expect(service.fit(['x'.repeat(100), 'y'], note.length + 2)).toEqual([
      `${'x'.repeat(note.length + 1)}…`,
    ]);
  });

  it('hard-truncates a single over-long line so it is still shown', () => {
    expect(service.fit(['x'.repeat(50)], 10)).toEqual([`${'x'.repeat(9)}…`]);
  });

  it('shows only the truncated first line when the budget is too small for a stub and the note', () => {
    expect(service.fit(['x'.repeat(50), 'y'], 10)).toEqual([
      `${'x'.repeat(9)}…`,
    ]);
  });
});
