import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpTournamentPathsService } from './tp-tournament-paths.service';

describe('TpTournamentPathsService', () => {
  let paths: TpTournamentPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpTournamentPathsService],
    }).compile();
    paths = moduleRef.get(TpTournamentPathsService);
  });

  it("builds a tournament's API path", () => {
    expect(paths.apiPath('s30')).toBe('tournament/s30');
  });

  it("builds a phase's fixtures path, and one round of it", () => {
    expect(paths.phaseApiPath('s30', 31255)).toBe(
      'tournament/s30/phases?page=0&pageSize=50&phaseId=31255&type=COACH',
    );
    expect(paths.phaseRoundApiPath('s30', 31255, 3)).toBe(
      'tournament/s30/phases?page=0&pageSize=50&phaseId=31255&type=COACH&round=3',
    );
  });

  it('builds a tournament page path', () => {
    expect(paths.frontendPath('s30', 'scores')).toBe('s30/scores');
  });

  it("builds a category's inscriptions path", () => {
    expect(paths.inscriptionsApiPath('s30', 22308)).toBe(
      'inscriptions/s30/category/22308/inscriptions?page=0&pageSize=75',
    );
  });

  it("builds a tournament's awards path", () => {
    expect(paths.awardsApiPath('s30')).toBe('awards/s30/awards');
  });
});
