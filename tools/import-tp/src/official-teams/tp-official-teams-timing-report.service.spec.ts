import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpOfficialTeamsTimingReportService } from './tp-official-teams-timing-report.service';

describe('TpOfficialTeamsTimingReportService', () => {
  let service: TpOfficialTeamsTimingReportService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpOfficialTeamsTimingReportService],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsTimingReportService);
  });

  it('reports nothing when no request was sent', () => {
    expect(service.summaryLines([])).toEqual([]);
  });

  it('reports each rules set and each of its requests, with stage durations', () => {
    expect(
      service.summaryLines([
        {
          rulesSet: 'BB2020',
          races: ['Orc', 'Dwarf'],
          positions: 38,
          wallMs: 1000.4,
          stages: [
            { stage: 'context', ms: 2.6 },
            { stage: 'races', ms: 40 },
            { stage: 'positions', ms: 700 },
          ],
        },
        {
          rulesSet: 'BB2025',
          races: ['Elf'],
          positions: 12,
          wallMs: 250,
          stages: [],
        },
        {
          rulesSet: 'BB2020',
          races: ['Elf'],
          positions: 12,
          wallMs: 500,
        },
      ]),
    ).toEqual([
      'Official team list import timing:',
      '  BB2020: 2 request(s), 1500 ms wall-clock',
      '    request 1/2 (Orc, Dwarf; 38 positions): 1000 ms wall-clock; context 3 ms, races 40 ms, positions 700 ms',
      '    request 2/2 (Elf; 12 positions): 500 ms wall-clock, failed',
      '  BB2025: 1 request(s), 250 ms wall-clock',
      '    request 1/1 (Elf; 12 positions): 250 ms wall-clock, no stage timings reported',
    ]);
  });

  it('rounds the rules-set total from the unrounded request times', () => {
    const lines = service.summaryLines([
      { rulesSet: 'BB2020', races: ['Elf'], positions: 1, wallMs: 0.4 },
      { rulesSet: 'BB2020', races: ['Orc'], positions: 1, wallMs: 0.4 },
      { rulesSet: 'BB2020', races: ['Dwarf'], positions: 1, wallMs: 0.4 },
    ]);
    expect(lines[1]).toBe('  BB2020: 3 request(s), 1 ms wall-clock');
    expect(lines[2]).toContain('0 ms wall-clock, failed');
  });
});
