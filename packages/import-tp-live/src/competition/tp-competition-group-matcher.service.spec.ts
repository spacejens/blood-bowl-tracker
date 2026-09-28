import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { NamePatternCandidate } from './tp-competition-group-matcher.service';
import { TpCompetitionGroupMatcherService } from './tp-competition-group-matcher.service';

const ALPHA: NamePatternCandidate = {
  id: 1,
  name: 'Alpha Cup',
  namePattern: '^(?:League[\\s-]*)?Alpha Cup(?:\\s*\\d+)?$',
};
const BETA: NamePatternCandidate = {
  id: 2,
  name: 'Beta Season',
  namePattern: '^(?:Beta Season|Beta Säsong)\\s*\\d+$',
};
const BETA_TOO: NamePatternCandidate = {
  id: 3,
  name: 'Beta Anything',
  namePattern: '^Beta',
};

describe('TpCompetitionGroupMatcherService', () => {
  let service: TpCompetitionGroupMatcherService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpCompetitionGroupMatcherService],
    }).compile();
    service = moduleRef.get(TpCompetitionGroupMatcherService);
  });

  it('matches the one group whose pattern matches the raw name', () => {
    expect(service.match('League - Alpha Cup 9', [ALPHA, BETA])).toEqual({
      kind: 'matched',
      group: ALPHA,
    });
  });

  it('matches case-insensitively, including non-ASCII alternation', () => {
    expect(service.match('BETA SÄSONG 31', [ALPHA, BETA])).toEqual({
      kind: 'matched',
      group: BETA,
    });
  });

  it('reports no match when no pattern matches', () => {
    expect(service.match('Gamma Open', [ALPHA, BETA])).toEqual({
      kind: 'unmatched',
    });
  });

  it('reports no match when there are no candidates', () => {
    expect(service.match('Alpha Cup 2', [])).toEqual({ kind: 'unmatched' });
  });

  it('reports every matching group when more than one pattern matches', () => {
    expect(service.match('Beta Season 4', [ALPHA, BETA, BETA_TOO])).toEqual({
      kind: 'ambiguous',
      groupNames: ['Beta Season', 'Beta Anything'],
    });
  });
});
