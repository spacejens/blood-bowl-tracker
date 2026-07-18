import { describe, expect, it } from 'vitest';

import type { TpSourceFile } from './source/tp-source-reader';
import { summarizeFiles } from './summarize-files';

function file(era: string, competition: string, type: string): TpSourceFile {
  return { era, competition, type, filename: `${type}_x.json`, content: {} };
}

describe('summarizeFiles', () => {
  it('returns an empty array for no files', () => {
    expect(summarizeFiles([])).toEqual([]);
  });

  it('summarizes competitions and a first-seen-order type histogram per era', () => {
    const files: TpSourceFile[] = [
      file('Fourth era', 'chaos-cup-8', 'match'),
      file('Fourth era', 'chaos-cup-8', 'match'),
      file('Fourth era', 'chaos-cup-8', 'rosters'),
      file('Fourth era', 'season-25', 'match'),
      file('Fourth era', 'season-25', 'tournament'),
    ];
    expect(summarizeFiles(files)).toEqual([
      'Fourth era: 2 competitions, 5 files (match: 3, rosters: 1, tournament: 1)',
    ]);
  });

  it('produces one line per era, in first-seen era order', () => {
    const files: TpSourceFile[] = [
      file('Fourth era', 'chaos-cup-8', 'match'),
      file('Third era', 'season-20', 'rosters'),
    ];
    expect(summarizeFiles(files)).toEqual([
      'Fourth era: 1 competitions, 1 files (match: 1)',
      'Third era: 1 competitions, 1 files (rosters: 1)',
    ]);
  });
});
