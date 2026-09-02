import { PLAYER_CHARACTERISTIC_KEYS } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicFormatMismatchError } from './characteristic-format-mismatch-error';
import {
  CharacteristicFormatValidationService,
  CHARACTERISTICS,
  type CharacteristicValues,
  type RulesSetFormats,
} from './characteristic-format-validation.service';

/** A modern rules set: Agility, Passing and Armour are all target numbers. */
const bb2020Formats: RulesSetFormats = {
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
};

/** An older rules set: no Passing characteristic at all. */
const crpFormats: RulesSetFormats = {
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'bare',
  passingFormat: 'absent',
  armourFormat: 'bare',
};

const bb2020Values: CharacteristicValues = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

const crpValues: CharacteristicValues = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: null,
  armour: 8,
};

describe('CharacteristicFormatValidationService', () => {
  let service: CharacteristicFormatValidationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicFormatValidationService],
    }).compile();
    service = moduleRef.get(CharacteristicFormatValidationService);
  });

  it('accepts values matching a modern rules set', () => {
    expect(() =>
      service.validate({
        values: bb2020Values,
        formats: bb2020Formats,
        rulesSetId: 4,
        subject: 'position 3',
      }),
    ).not.toThrow();
  });

  it('accepts a null value for a characteristic the rules set declares absent', () => {
    expect(() =>
      service.validate({
        values: crpValues,
        formats: crpFormats,
        rulesSetId: 5,
        subject: 'position 3',
      }),
    ).not.toThrow();
  });

  it('rejects a value supplied for a characteristic the rules set declares absent', () => {
    expect(() =>
      service.validate({
        values: { ...crpValues, passing: 4 },
        formats: crpFormats,
        rulesSetId: 5,
        subject: 'position 3',
      }),
    ).toThrow(CharacteristicFormatMismatchError);
  });

  it('names the offending characteristic and the subject in the rejection', () => {
    expect(() =>
      service.validate({
        values: { ...crpValues, passing: 4 },
        formats: crpFormats,
        rulesSetId: 5,
        subject: 'position 3',
      }),
    ).toThrow(/Passing.*position 3/);
  });

  it('rejects a missing value for a characteristic the rules set requires', () => {
    expect(() =>
      service.validate({
        values: { ...bb2020Values, passing: null },
        formats: bb2020Formats,
        rulesSetId: 4,
        subject: 'position 3',
      }),
    ).toThrow(CharacteristicFormatMismatchError);
  });

  it('rejects a rules set that does not exist', () => {
    expect(() =>
      service.validate({
        values: bb2020Values,
        formats: undefined,
        rulesSetId: 99,
        subject: 'player 1:12345',
      }),
    ).toThrow(CharacteristicFormatMismatchError);
  });

  it('names the missing rules set and the subject in that rejection', () => {
    expect(() =>
      service.validate({
        values: bb2020Values,
        formats: undefined,
        rulesSetId: 99,
        subject: 'player 1:12345',
      }),
    ).toThrow(/99.*player 1:12345/);
  });

  it('checks every one of the five characteristics', () => {
    expect(CHARACTERISTICS.map((characteristic) => characteristic.key)).toEqual(
      ['move', 'strength', 'agility', 'passing', 'armour'],
    );
  });

  it('agrees with PLAYER_CHARACTERISTIC_KEYS on key order', () => {
    expect(CHARACTERISTICS.map((characteristic) => characteristic.key)).toEqual(
      PLAYER_CHARACTERISTIC_KEYS,
    );
  });
});
