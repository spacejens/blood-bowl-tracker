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
    expect(paths.tournament('s30')).toBe('tournament/s30');
    expect(paths.news('s30')).toBe('tournament/s30/news');
    expect(paths.teamStats('s30')).toBe('tournament/s30/team-stats');
    expect(paths.lineupStats('s30')).toBe('tournament/s30/lineup-stats');
    expect(paths.coachStats('s30')).toBe('tournament/s30/coach-stats');
    expect(paths.statistics('s30')).toBe('tournament/s30/statistics');
    expect(paths.awards('s30')).toBe('awards/s30/awards');
  });

  it('builds a phase path, and a round of it', () => {
    expect(paths.phase('s30', 31255)).toBe(
      'tournament/s30/phases?page=0&pageSize=50&phaseId=31255&type=COACH',
    );
    expect(paths.phaseRound('s30', 31255, 3)).toBe(
      'tournament/s30/phases?page=0&pageSize=50&phaseId=31255&type=COACH&round=3',
    );
  });

  it("builds a phase's classifications path, in TP's own spelling", () => {
    expect(paths.classifications('s30', 34100)).toBe(
      'tournament/s30/clasifications?page=0&pageSize=75&phaseId=34100&type=COACH',
    );
  });

  it("builds a category's inscriptions path", () => {
    expect(paths.inscriptions('s30', 22308)).toBe(
      'inscriptions/s30/category/22308/inscriptions?page=0&pageSize=75',
    );
  });

  it('builds the match, roster and official team list paths', () => {
    expect(paths.match(576264)).toBe('match/576264');
    expect(paths.roster(163386)).toBe('rosters/163386');
    expect(paths.officialTeams(25)).toBe('rosters/masters?ruleSet=25');
  });
});
