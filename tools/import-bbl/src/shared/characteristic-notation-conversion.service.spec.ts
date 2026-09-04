import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicNotationConversionService } from './characteristic-notation-conversion.service';

describe('CharacteristicNotationConversionService', () => {
  let service: CharacteristicNotationConversionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicNotationConversionService],
    }).compile();
    service = moduleRef.get(CharacteristicNotationConversionService);
  });

  describe('convertAgility', () => {
    // The input is always BBL's scraped BB2020-notation target; pre-BB2020
    // Agility sits on a complementary scale where the two sum to 6 — new 2+
    // is old AG 4, new 3+ is old AG 3, new 4+ is old AG 2. Clamped to a 1
    // floor: old notation has no AG 0, so a scraped 6 (which would compute
    // to 0) clamps to 1, same as 5.
    const bareCases: [raw: number, converted: number][] = [
      [2, 4],
      [3, 3],
      [4, 2],
      [5, 1],
      [6, 1],
    ];
    it.each(bareCases)(
      'converts a scraped Agility %i into bare-notation %i',
      (raw, converted) => {
        expect(service.convertAgility(raw, 'bare')).toBe(converted);
      },
    );

    const passThroughFormats: CharacteristicFormat[] = ['plus', 'absent'];
    it.each(passThroughFormats)(
      'passes a %s-notation Agility through unchanged',
      (format) => {
        expect(service.convertAgility(3, format)).toBe(3);
      },
    );
  });

  describe('convertArmour', () => {
    // The input is always BBL's scraped BB2020-notation minimum-roll value;
    // pre-BB2020 Armour is the value a roll had to come out above, one lower.
    const bareCases: [raw: number, converted: number][] = [
      [8, 7],
      [9, 8],
      [10, 9],
      [11, 10],
    ];
    it.each(bareCases)(
      'converts a scraped Armour %i into bare-notation %i',
      (raw, converted) => {
        expect(service.convertArmour(raw, 'bare')).toBe(converted);
      },
    );

    const passThroughFormats: CharacteristicFormat[] = ['plus', 'absent'];
    it.each(passThroughFormats)(
      'passes a %s-notation Armour through unchanged',
      (format) => {
        expect(service.convertArmour(9, format)).toBe(9);
      },
    );
  });
});
