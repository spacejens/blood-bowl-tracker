import { PLAYER_LASTING_INJURY_KEYS } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LastingInjuryValidationError } from '../shared/lasting-injury-validation-error';
import { PlayerLastingInjuryValidationService } from './player-lasting-injury-validation.service';

const externalIds = [{ externalSystemId: 1, externalId: 'pid-7' }];

const base = { name: 'Griff Oberwald', teamEraId: 10, positionId: 20 };

/** A full, internally consistent lasting-injury line. */
const fullLine = {
  missNextGame: true,
  nigglingInjuryCount: 2,
  moveReductionCount: 1,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 3,
};

describe('PlayerLastingInjuryValidationService', () => {
  let service: PlayerLastingInjuryValidationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerLastingInjuryValidationService],
    }).compile();
    service = moduleRef.get(PlayerLastingInjuryValidationService);
  });

  it('does nothing when every lasting-injury field is supplied and valid', () => {
    expect(() =>
      service.validate({
        ...base,
        ...fullLine,
        externalIds,
      }),
    ).not.toThrow();
  });

  it('does nothing when no lasting-injury field is supplied', () => {
    expect(() => service.validate({ ...base, externalIds })).not.toThrow();
  });

  it('throws when only some of the lasting-injury fields are supplied', () => {
    expect(() =>
      service.validate({
        ...base,
        missNextGame: true,
        nigglingInjuryCount: 1,
        externalIds,
      }),
    ).toThrow(LastingInjuryValidationError);
  });

  it('names every lasting-injury key in the all-or-nothing message', () => {
    expect(() =>
      service.validate({
        ...base,
        missNextGame: true,
        externalIds,
      }),
    ).toThrow(new RegExp(PLAYER_LASTING_INJURY_KEYS.join(', ')));
  });

  it('names the offending player in the all-or-nothing message', () => {
    expect(() =>
      service.validate({
        ...base,
        missNextGame: true,
        externalIds,
      }),
    ).toThrow(/player 1:pid-7/);
  });

  it('treats missNextGame alone as part of the all-or-nothing group', () => {
    // missNextGame is a boolean, not one of the six counts, but it is still a
    // member of PLAYER_LASTING_INJURY_KEYS and must not be validated on its
    // own — supplying it without the six counts is still a partial group.
    expect(() =>
      service.validate({
        ...base,
        missNextGame: false,
        externalIds,
      }),
    ).toThrow(LastingInjuryValidationError);
  });

  it.each([
    'nigglingInjuryCount',
    'moveReductionCount',
    'strengthReductionCount',
    'agilityReductionCount',
    'passingReductionCount',
    'armourReductionCount',
  ] as const)('throws when %s is negative', (key) => {
    expect(() =>
      service.validate({
        ...base,
        ...fullLine,
        [key]: -1,
        externalIds,
      }),
    ).toThrow(LastingInjuryValidationError);
  });

  it('throws when a count is a non-integer', () => {
    expect(() =>
      service.validate({
        ...base,
        ...fullLine,
        nigglingInjuryCount: 1.5,
        externalIds,
      }),
    ).toThrow(LastingInjuryValidationError);
  });
});
