import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpCompetitionGroupPrecedentService } from './tp-competition-group-precedent.service';

describe('TpCompetitionGroupPrecedentService', () => {
  let service: TpCompetitionGroupPrecedentService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpCompetitionGroupPrecedentService],
    }).compile();
    service = moduleRef.get(TpCompetitionGroupPrecedentService);
  });

  describe('nextName', () => {
    it('numbers the new competition one past the highest existing number', () => {
      expect(
        service.nextName({
          groupName: 'Chaos Cup',
          existingNames: ['Chaos Cup 2', 'Chaos Cup 8', 'Chaos Cup 7'],
        }),
      ).toBe('Chaos Cup 9');
    });

    it('counts a single unnumbered precedent as 1', () => {
      expect(
        service.nextName({
          groupName: 'Fright Night',
          existingNames: ['Fright Night'],
        }),
      ).toBe('Fright Night 2');
    });

    it('counts an unnumbered first instalment alongside numbered ones', () => {
      expect(
        service.nextName({
          groupName: 'Moot Mania',
          existingNames: ['Moot Mania', 'Moot Mania 2'],
        }),
      ).toBe('Moot Mania 3');
    });

    it('takes the number from whatever name each sibling carries', () => {
      expect(
        service.nextName({
          groupName: 'Minor Season',
          existingNames: ['Korpen 9', 'Minor Season 25'],
        }),
      ).toBe('Minor Season 26');
    });

    it('uses the group name verbatim when the group has no competition yet', () => {
      expect(
        service.nextName({ groupName: 'Reserves Rumble', existingNames: [] }),
      ).toBe('Reserves Rumble');
    });
  });

  describe('sharedType', () => {
    it('returns the type every competition shares', () => {
      expect(service.sharedType(['cup', 'cup', 'cup'])).toBe('cup');
    });

    it('returns undefined when the types disagree', () => {
      expect(service.sharedType(['season', 'cup'])).toBeUndefined();
    });

    it('returns undefined when there is no competition', () => {
      expect(service.sharedType([])).toBeUndefined();
    });
  });
});
