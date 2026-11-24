import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImportRunSummaryService } from './import-run-summary.service';
import type { ImportResult } from './types';

const ok = (imported: number): ImportResult => ({
  success: true,
  imported,
  errors: [],
});

describe('ImportRunSummaryService', () => {
  let service: ImportRunSummaryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ImportRunSummaryService],
    }).compile();
    service = moduleRef.get(ImportRunSummaryService);
  });

  it('reports the summed record count on stdout with exit code 0 when every step succeeded', () => {
    expect(service.summarize([ok(3), ok(0), ok(4)])).toEqual({
      stdout: ['Imported 7 record(s) successfully.'],
      stderr: [],
      exitCode: 0,
    });
  });

  it('reports zero records as a success for an empty run', () => {
    expect(service.summarize([])).toEqual({
      stdout: ['Imported 0 record(s) successfully.'],
      stderr: [],
      exitCode: 0,
    });
  });

  it('lists every error across the steps, in step order, on stderr with exit code 1', () => {
    const summary = service.summarize([
      { success: false, imported: 2, errors: [{ item: 1, message: 'first' }] },
      ok(5),
      {
        success: false,
        imported: 0,
        errors: [
          { item: 2, message: 'second' },
          { item: 3, message: 'third' },
        ],
      },
    ]);

    expect(summary).toEqual({
      stdout: [],
      stderr: [
        'Import completed with 3 errors:',
        '  - first',
        '  - second',
        '  - third',
      ],
      exitCode: 1,
    });
  });

  it('fails the run when a step reports failure without errors', () => {
    expect(
      service.summarize([ok(1), { success: false, imported: 0, errors: [] }]),
    ).toEqual({
      stdout: [],
      stderr: ['Import completed with 0 errors:'],
      exitCode: 1,
    });
  });
});
