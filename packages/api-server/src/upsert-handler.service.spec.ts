import {
  MatchCategoryMismatchError,
  MissingRequiredFieldError,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConflictErrors } from './upsert-handler.service';
import { UpsertHandlerService } from './upsert-handler.service';

class TestConflictError extends Error {}
class ConflictReply extends Error {}
class BadRequestReply extends Error {}

describe('UpsertHandlerService', () => {
  let handler: UpsertHandlerService;
  let errors: ConflictErrors;

  beforeEach(async () => {
    errors = {
      CONFLICT: vi.fn(
        ({ message }: { message: string }) => new ConflictReply(message),
      ),
      BAD_REQUEST: vi.fn(
        ({ message }: { message: string }) => new BadRequestReply(message),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [UpsertHandlerService],
    }).compile();
    handler = moduleRef.get(UpsertHandlerService);
  });

  it('flattens the entity and created flag on success', async () => {
    await expect(
      handler.run(errors, TestConflictError, () =>
        Promise.resolve({ entity: { id: 1, name: 'Griff' }, created: true }),
      ),
    ).resolves.toEqual({ id: 1, name: 'Griff', created: true });
  });

  it('translates the entity conflict error into a CONFLICT reply', async () => {
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw new TestConflictError('two matches');
      }),
    ).rejects.toBeInstanceOf(ConflictReply);
    expect(errors.CONFLICT).toHaveBeenCalledWith({ message: 'two matches' });
  });

  it('translates a missing-required-field error into a BAD_REQUEST reply', async () => {
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw new MissingRequiredFieldError(
          'Cannot create new eras: missing required field(s): leagueId',
        );
      }),
    ).rejects.toBeInstanceOf(BadRequestReply);
    expect(errors.BAD_REQUEST).toHaveBeenCalledWith({
      message: 'Cannot create new eras: missing required field(s): leagueId',
    });
  });

  it('translates a match category mismatch error into a BAD_REQUEST reply', async () => {
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw new MatchCategoryMismatchError(
          'Match category cup_final is not valid for competition type season',
        );
      }),
    ).rejects.toBeInstanceOf(BadRequestReply);
    expect(errors.BAD_REQUEST).toHaveBeenCalledWith({
      message:
        'Match category cup_final is not valid for competition type season',
    });
  });

  it('rethrows any other error untouched', async () => {
    const boom = new Error('db is down');
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
