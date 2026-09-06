import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ManualEntryMatcherService } from './manual-entry-matcher.service';

describe('ManualEntryMatcherService', () => {
  let service: ManualEntryMatcherService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ManualEntryMatcherService],
    }).compile();
    service = moduleRef.get(ManualEntryMatcherService);
  });
  describe('matchesRace', () => {
    it('matches when the entry name equals the race name', () => {
      expect(
        service.matchesRace({ name: 'Dwarf', externalIds: [] }, 'Dwarf', []),
      ).toBe(true);
    });

    it('matches when an external id pair equals one of the race owned ids', () => {
      expect(
        service.matchesRace(
          {
            name: 'Dwarf (curated)',
            externalIds: [{ system: 'BBL', id: '5' }],
          },
          'Dwarf',
          [{ systemName: 'BBL', externalId: '5' }],
        ),
      ).toBe(true);
    });

    it('does not match when neither the name nor any external id agrees', () => {
      expect(
        service.matchesRace(
          { name: 'Orc', externalIds: [{ system: 'BBL', id: '99' }] },
          'Dwarf',
          [{ systemName: 'BBL', externalId: '5' }],
        ),
      ).toBe(false);
    });

    it('does not match on system alone, or id alone, without the other agreeing', () => {
      expect(
        service.matchesRace(
          { name: 'Orc', externalIds: [{ system: 'BBL', id: '99' }] },
          'Dwarf',
          [{ systemName: 'TP', externalId: '99' }],
        ),
      ).toBe(false);
    });
  });

  describe('refMatchesRace', () => {
    it('matches when the ref equals one of the race owned ids', () => {
      expect(
        service.refMatchesRace({ system: 'BBL', id: '5' }, [
          { systemName: 'BBL', externalId: '5' },
        ]),
      ).toBe(true);
    });

    it('does not match when no owned id shares both system and id', () => {
      expect(
        service.refMatchesRace({ system: 'BBL', id: '5' }, [
          { systemName: 'TP', externalId: '5' },
        ]),
      ).toBe(false);
    });
  });
});
