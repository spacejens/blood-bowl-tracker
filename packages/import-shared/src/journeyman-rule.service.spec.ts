import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { JourneymanRuleService } from './journeyman-rule.service';

describe('JourneymanRuleService', () => {
  let service: JourneymanRuleService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [JourneymanRuleService],
    }).compile();
    service = moduleRef.get(JourneymanRuleService);
  });

  describe('isJourneymanName', () => {
    it.each(['Journeyman', 'journeyman', 'JOURNEYMAN', '  Journeyman '])(
      'accepts %j',
      (name) => {
        expect(service.isJourneymanName(name)).toBe(true);
      },
    );

    it.each(['Journeyman?', 'Journeyman 2', 'Nadiddnur', ''])(
      'rejects %j',
      (name) => {
        expect(service.isJourneymanName(name)).toBe(false);
      },
    );
  });

  describe('isLonerName', () => {
    it.each(['Loner', 'loner', ' LONER '])('accepts %j', (name) => {
      expect(service.isLonerName(name)).toBe(true);
    });

    it('rejects another skill', () => {
      expect(service.isLonerName('Block')).toBe(false);
    });
  });

  describe('decide for a line-up sighting', () => {
    it('sets the marker for a journeyman in a basic position', () => {
      expect(
        service.decide({
          name: 'Journeyman',
          isBasicPosition: true,
          sighting: 'lineUp',
        }),
      ).toBe(true);
    });

    it('says nothing for a renamed player, so a line-up never clears', () => {
      expect(
        service.decide({
          name: 'Griff',
          isBasicPosition: true,
          sighting: 'lineUp',
        }),
      ).toBeUndefined();
    });

    it('says nothing for a journeyman name outside a basic position', () => {
      expect(
        service.decide({
          name: 'Journeyman',
          isBasicPosition: false,
          sighting: 'lineUp',
        }),
      ).toBeUndefined();
    });
  });

  describe('decide for a roster sighting', () => {
    it('clears the marker for a renamed player', () => {
      expect(
        service.decide({
          name: 'Griff',
          isBasicPosition: true,
          sighting: 'roster',
          lonerListed: true,
        }),
      ).toBe(false);
    });

    it('clears the marker outside a basic position', () => {
      expect(
        service.decide({
          name: 'Journeyman',
          isBasicPosition: false,
          sighting: 'roster',
          lonerListed: true,
        }),
      ).toBe(false);
    });

    it('sets the marker when the roster lists Loner', () => {
      expect(
        service.decide({
          name: 'journeyman',
          isBasicPosition: true,
          sighting: 'roster',
          lonerListed: true,
        }),
      ).toBe(true);
    });

    it('clears the marker when the roster lists no Loner (recruited)', () => {
      expect(
        service.decide({
          name: 'Journeyman',
          isBasicPosition: true,
          sighting: 'roster',
          lonerListed: false,
        }),
      ).toBe(false);
    });

    it('sets the marker by name when the roster cannot say whether Loner is listed', () => {
      expect(
        service.decide({
          name: 'Journeyman',
          isBasicPosition: true,
          sighting: 'roster',
        }),
      ).toBe(true);
    });
  });
});
