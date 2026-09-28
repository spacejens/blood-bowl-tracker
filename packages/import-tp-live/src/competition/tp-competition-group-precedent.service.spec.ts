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
    describe('when the raw TP name carries a trailing number', () => {
      it('uses it over the stored highest number (out-of-order backfill)', () => {
        expect(
          service.nextName({
            groupName: 'Season',
            rawName: 'Season 32',
            existingNames: ['Season 29', 'Season 30'],
          }),
        ).toBe('Season 32');
      });

      it('uses it to fill a gap below the stored highest number', () => {
        expect(
          service.nextName({
            groupName: 'Chaos Cup',
            rawName: 'tLoEGBBL Chaos Cup 9',
            existingNames: ['Chaos Cup 8', 'Chaos Cup 10'],
          }),
        ).toBe('Chaos Cup 9');
      });

      it('uses it for the first competition of a group with none yet', () => {
        expect(
          service.nextName({
            groupName: 'Chaos Cup',
            rawName: 'tLoEGBBL Chaos Cup 9',
            existingNames: [],
          }),
        ).toBe('Chaos Cup 9');
      });

      it('falls back to one past the highest when it collides with a sibling', () => {
        expect(
          service.nextName({
            groupName: 'Chaos Cup',
            rawName: 'tLoEGBBL Chaos Cup 8',
            existingNames: ['Chaos Cup 7', 'Chaos Cup 8'],
          }),
        ).toBe('Chaos Cup 9');
      });

      it('treats a raw 1 as colliding with an unnumbered sibling', () => {
        expect(
          service.nextName({
            groupName: 'Fright Night',
            rawName: 'Fright Night 1',
            existingNames: ['Fright Night'],
          }),
        ).toBe('Fright Night 2');
      });
    });

    describe('when the raw TP name carries no trailing number', () => {
      it('numbers the new competition one past the highest existing number', () => {
        expect(
          service.nextName({
            groupName: 'Chaos Cup',
            rawName: 'tLoEGBBL Chaos Cup',
            existingNames: ['Chaos Cup 2', 'Chaos Cup 8', 'Chaos Cup 7'],
          }),
        ).toBe('Chaos Cup 9');
      });

      it('counts a single unnumbered precedent as 1', () => {
        expect(
          service.nextName({
            groupName: 'Fright Night',
            rawName: 'Fright Night',
            existingNames: ['Fright Night'],
          }),
        ).toBe('Fright Night 2');
      });

      it('counts an unnumbered first instalment alongside numbered ones', () => {
        expect(
          service.nextName({
            groupName: 'Moot Mania',
            rawName: 'Moot Mania',
            existingNames: ['Moot Mania', 'Moot Mania 2'],
          }),
        ).toBe('Moot Mania 3');
      });

      it('takes the number from whatever name each sibling carries', () => {
        expect(
          service.nextName({
            groupName: 'Minor Season',
            rawName: 'Minor Season',
            existingNames: ['Korpen 9', 'Minor Season 25'],
          }),
        ).toBe('Minor Season 26');
      });

      it('uses the group name verbatim when the group has no competition yet', () => {
        expect(
          service.nextName({
            groupName: 'Reserves Rumble',
            rawName: 'Reserves Rumble',
            existingNames: [],
          }),
        ).toBe('Reserves Rumble');
      });
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
