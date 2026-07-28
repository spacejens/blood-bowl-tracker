import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MatchCategoryClassifierService } from './match-category-classifier.service';

describe('MatchCategoryClassifierService', () => {
  let service: MatchCategoryClassifierService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MatchCategoryClassifierService],
    }).compile();
    service = moduleRef.get(MatchCategoryClassifierService);
  });

  const classify = (name: string, competitionType: 'season' | 'cup') =>
    service.classify({ bblId: '1830', name, competitionType });

  it.each([
    ['Match 1'],
    ['Vecka 40-41'],
    ['Runda 3'],
    ['Rond 6'],
    ['Round 2'],
    ['48 - 49'],
    ['Augusti'],
    ['CVC Match 1'],
    ['Extra'],
    ['Exhibition-match'],
    ['Abendessen Bier'],
    ['Bierhallentodball'],
    ['Deathball'],
    ['Least and last'],
  ])('classifies %s as normal', (name) => {
    expect(classify(name, 'season')).toBe('normal');
    expect(classify(name, 'cup')).toBe('normal');
  });

  it('classifies Final as season_final in a season', () => {
    expect(classify('Final', 'season')).toBe('season_final');
  });

  it('classifies Final as cup_final in a cup', () => {
    expect(classify('Final', 'cup')).toBe('cup_final');
  });

  it('classifies Finalmatch the same way as Final', () => {
    expect(classify('Finalmatch', 'cup')).toBe('cup_final');
    expect(classify('Finalmatch', 'season')).toBe('season_final');
  });

  it.each([['Semifinal'], ['Semi'], ['Semifinal 2']])(
    'classifies %s as season_semi_final',
    (name) => {
      expect(classify(name, 'season')).toBe('season_semi_final');
    },
  );

  it('classifies Bronsmatch as season_bronze', () => {
    expect(classify('Bronsmatch', 'season')).toBe('season_bronze');
  });

  it.each([['Kval'], ['Kvalmatch'], ['Kval 1'], ['Kval 2']])(
    'classifies %s as season_qualifier',
    (name) => {
      expect(classify(name, 'season')).toBe('season_qualifier');
    },
  );

  it('matches keywords case-insensitively and ignores surrounding whitespace', () => {
    expect(classify('  FINAL  ', 'cup')).toBe('cup_final');
    expect(classify('semifinal', 'season')).toBe('season_semi_final');
  });

  it.each([
    ['SL Final - Deathmatch'],
    ['Slutspel rond1 wo'],
    ['Kvartsfinal'],
    ['Bronze Final Playoff'],
  ])('throws for the stage-like but unrecognized name %s', (name) => {
    expect(() => classify(name, 'season')).toThrow(/BBL match 1830/);
  });

  it('names the offending text and the id in the thrown message', () => {
    expect(() => classify('SL Final - Deathmatch', 'cup')).toThrow(
      /SL Final - Deathmatch/,
    );
  });

  it.each([['Semifinal'], ['Bronsmatch'], ['Kval']])(
    'throws for %s on a cup competition, since only season stages have those keywords',
    (name) => {
      expect(() => classify(name, 'cup')).toThrow(/BBL match 1830/);
    },
  );

  it('names the match id in the thrown message for a season keyword on a cup', () => {
    expect(() => classify('Semifinal', 'cup')).toThrow(/1830/);
  });
});
