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
    // Pre-BB2020 Agility is a plain number; BB2020 writes the target a D6
    // has to meet. AG 4 old == 2+ new, AG 3 old == 3+ new, and so on, with a
    // 2+ floor because a natural 1 always fails under every rules set.
    const bareCases: [raw: number, converted: number][] = [
      [1, 6],
      [2, 5],
      [3, 4],
      [4, 3],
      [5, 2],
      [6, 2],
      [7, 2],
    ];
    it.each(bareCases)(
      'converts a bare-notation Agility %i to %i',
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
    // Pre-BB2020 Armour is the value a 2D6 roll has to beat; BB2020 writes
    // the minimum roll that breaks it, which is one higher.
    const bareCases: [raw: number, converted: number][] = [
      [8, 7],
      [9, 8],
      [10, 9],
      [11, 10],
    ];
    it.each(bareCases)(
      'converts a bare-notation Armour %i to %i',
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
