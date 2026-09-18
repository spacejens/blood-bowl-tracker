import { PLAYER_CHARACTERISTIC_INCREASE_KEYS } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicIncreaseValidationError } from '../shared/characteristic-increase-validation-error';
import { PlayerCharacteristicIncreaseValidationService } from './player-characteristic-increase-validation.service';

const externalIds = [{ externalSystemId: 1, externalId: 'pid-7' }];

const base = { name: 'Griff Oberwald', teamEraId: 10, positionId: 20 };

/** A full, internally consistent characteristic-increase line. */
const fullLine = {
  moveIncreaseCount: 1,
  strengthIncreaseCount: 0,
  agilityIncreaseCount: 2,
  passingIncreaseCount: 0,
  armourIncreaseCount: 1,
};

describe('PlayerCharacteristicIncreaseValidationService', () => {
  let service: PlayerCharacteristicIncreaseValidationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerCharacteristicIncreaseValidationService],
    }).compile();
    service = moduleRef.get(PlayerCharacteristicIncreaseValidationService);
  });

  it('does nothing when every characteristic-increase field is supplied and valid', () => {
    expect(() =>
      service.validate({
        ...base,
        ...fullLine,
        externalIds,
      }),
    ).not.toThrow();
  });

  it('does nothing when no characteristic-increase field is supplied', () => {
    expect(() => service.validate({ ...base, externalIds })).not.toThrow();
  });

  it('throws when only some of the characteristic-increase fields are supplied', () => {
    expect(() =>
      service.validate({
        ...base,
        moveIncreaseCount: 1,
        externalIds,
      }),
    ).toThrow(CharacteristicIncreaseValidationError);
  });

  it('names every characteristic-increase key in the all-or-nothing message', () => {
    expect(() =>
      service.validate({
        ...base,
        moveIncreaseCount: 1,
        externalIds,
      }),
    ).toThrow(new RegExp(PLAYER_CHARACTERISTIC_INCREASE_KEYS.join(', ')));
  });

  it('names the offending player in the all-or-nothing message', () => {
    expect(() =>
      service.validate({
        ...base,
        moveIncreaseCount: 1,
        externalIds,
      }),
    ).toThrow(/player 1:pid-7/);
  });

  it.each([
    'moveIncreaseCount',
    'strengthIncreaseCount',
    'agilityIncreaseCount',
    'passingIncreaseCount',
    'armourIncreaseCount',
  ] as const)('throws when %s is negative', (key) => {
    expect(() =>
      service.validate({
        ...base,
        ...fullLine,
        [key]: -1,
        externalIds,
      }),
    ).toThrow(CharacteristicIncreaseValidationError);
  });

  it('throws when a count is a non-integer', () => {
    expect(() =>
      service.validate({
        ...base,
        ...fullLine,
        moveIncreaseCount: 1.5,
        externalIds,
      }),
    ).toThrow(CharacteristicIncreaseValidationError);
  });
});
