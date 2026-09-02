import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ManualEntryMatcherService } from './manual-entry-matcher.service';

async function makeService(): Promise<ManualEntryMatcherService> {
  const moduleRef = await Test.createTestingModule({
    providers: [ManualEntryMatcherService],
  }).compile();
  return moduleRef.get(ManualEntryMatcherService);
}

describe('ManualEntryMatcherService', () => {
  describe('matchesRace', () => {
    it('matches when the entry name equals the race name', async () => {
      const service = await makeService();

      expect(
        service.matchesRace({ name: 'Dwarf', externalIds: [] }, 'Dwarf', []),
      ).toBe(true);
    });

    it('matches when an external id pair equals one of the race owned ids', async () => {
      const service = await makeService();

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

    it('does not match when neither the name nor any external id agrees', async () => {
      const service = await makeService();

      expect(
        service.matchesRace(
          { name: 'Orc', externalIds: [{ system: 'BBL', id: '99' }] },
          'Dwarf',
          [{ systemName: 'BBL', externalId: '5' }],
        ),
      ).toBe(false);
    });

    it('does not match on system alone, or id alone, without the other agreeing', async () => {
      const service = await makeService();

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
    it('matches when the ref equals one of the race owned ids', async () => {
      const service = await makeService();

      expect(
        service.refMatchesRace({ system: 'BBL', id: '5' }, [
          { systemName: 'BBL', externalId: '5' },
        ]),
      ).toBe(true);
    });

    it('does not match when no owned id shares both system and id', async () => {
      const service = await makeService();

      expect(
        service.refMatchesRace({ system: 'BBL', id: '5' }, [
          { systemName: 'TP', externalId: '5' },
        ]),
      ).toBe(false);
    });
  });
});
