import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpFileKind } from './tp-file-name.service';
import { TpFileNameService } from './tp-file-name.service';

describe('TpFileNameService', () => {
  let service: TpFileNameService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpFileNameService],
    }).compile();
    service = moduleRef.get(TpFileNameService);
  });

  it.each<[string, TpFileKind]>([
    ['match_123.json', { kind: 'match', matchId: '123' }],
    ['rosters_45.json', { kind: 'rosters', rosterId: '45' }],
    [
      'rosters_masters?ruleSet=20.json',
      { kind: 'rosters-masters', ruleSetId: '20' },
    ],
    [
      'tournament_-ogretoberfest-12--.json',
      { kind: 'tournament', slug: '-ogretoberfest-12--', subpage: null },
    ],
    [
      'tournament_-ogretoberfest-12--_coach-stats.json',
      {
        kind: 'tournament',
        slug: '-ogretoberfest-12--',
        subpage: 'coach-stats',
      },
    ],
    [
      'tournament_x_clasifications?type=COACH.json',
      { kind: 'tournament', slug: 'x', subpage: 'clasifications?type=COACH' },
    ],
    [
      'awards_-ogretoberfest-12--_awards.json',
      { kind: 'awards', slug: '-ogretoberfest-12--' },
    ],
    [
      'inscriptions_-ogretoberfest-12--_inscriptions.json',
      { kind: 'inscriptions', slug: '-ogretoberfest-12--' },
    ],
    ['match_abc.json', { kind: 'other' }],
    ['rosters_45.json.bak', { kind: 'other' }],
    ['notes.txt', { kind: 'other' }],
  ])('classifies %s', (filename, expected) => {
    expect(service.classify(filename)).toEqual(expected);
  });

  it('never reads rosters_masters as a roster', () => {
    expect(service.classify('rosters_masters?ruleSet=25.json').kind).toBe(
      'rosters-masters',
    );
  });
});
