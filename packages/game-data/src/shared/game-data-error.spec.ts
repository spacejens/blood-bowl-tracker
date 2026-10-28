import { describe, expect, it } from 'vitest';

import { ManualImportBatchContentMismatchError } from '../manual-import-batches/manual-import-batches.service';
import { MatchCategoryMismatchError } from '../matches/matches.service';
import {
  TrophyAwardCompetitionGroupMismatchError,
  TrophyAwardRecipientMismatchError,
} from '../trophy-awards/trophy-awards.service';
import { AdvancementCostValidationError } from './advancement-cost-validation-error';
import { CharacteristicFormatMismatchError } from './characteristic-format-mismatch-error';
import { CharacteristicIncreaseValidationError } from './characteristic-increase-validation-error';
import { GameDataError } from './game-data-error';
import { KeywordValidationError } from './keyword-validation-error';
import { LastingInjuryValidationError } from './lasting-injury-validation-error';
import { MissingRequiredFieldError } from './missing-required-field-error';
import { PositionSkillCategoryValidationError } from './position-skill-category-validation-error';
import { PositionValidationError } from './position-validation-error';
import { SkillValidationError } from './skill-validation-error';
import { SppAwardValueValidationError } from './spp-award-value-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';
import { UpsertConflictError } from './upsert-conflict-error';

class ExampleError extends GameDataError {}

const gameDataErrors: (new (message?: string) => GameDataError)[] = [
  MatchCategoryMismatchError,
  CharacteristicIncreaseValidationError,
  UpsertConflictError,
  KeywordValidationError,
  PositionSkillCategoryValidationError,
  CharacteristicFormatMismatchError,
  MissingRequiredFieldError,
  SkillValidationError,
  SyncBatchValidationError,
  SppAwardValueValidationError,
  AdvancementCostValidationError,
  PositionValidationError,
  LastingInjuryValidationError,
  ManualImportBatchContentMismatchError,
  TrophyAwardRecipientMismatchError,
  TrophyAwardCompetitionGroupMismatchError,
];

describe('GameDataError', () => {
  it('names a subclass instance after its class and keeps the message', () => {
    const error = new ExampleError('boom');

    expect(error.name).toBe('ExampleError');
    expect(error.message).toBe('boom');
    expect(error).toBeInstanceOf(ExampleError);
    expect(error).toBeInstanceOf(GameDataError);
    expect(error).toBeInstanceOf(Error);
  });

  it('names a direct instance GameDataError', () => {
    expect(new GameDataError('boom').name).toBe('GameDataError');
  });

  it.each(gameDataErrors)(
    '%p is a GameDataError named after its class',
    (Cls) => {
      const error = new Cls('boom');

      expect(error).toBeInstanceOf(GameDataError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(Cls.name);
      expect(error.message).toBe('boom');
    },
  );
});
