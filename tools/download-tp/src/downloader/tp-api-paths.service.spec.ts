import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpApiPathsService } from './tp-api-paths.service';

describe('TpApiPathsService', () => {
  let paths: TpApiPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpApiPathsService],
    }).compile();
    paths = moduleRef.get(TpApiPathsService);
  });

  it('builds the tournament-level paths', () => {
    expect(paths.news('s30')).toBe('tournament/s30/news');
    expect(paths.teamStats('s30')).toBe('tournament/s30/team-stats');
    expect(paths.lineupStats('s30')).toBe('tournament/s30/lineup-stats');
    expect(paths.coachStats('s30')).toBe('tournament/s30/coach-stats');
    expect(paths.statistics('s30')).toBe('tournament/s30/statistics');
  });

  it("builds a phase's classifications path, in TP's own spelling", () => {
    expect(paths.classifications('s30', 34100)).toBe(
      'tournament/s30/clasifications?page=0&pageSize=75&phaseId=34100&type=COACH',
    );
  });
});
