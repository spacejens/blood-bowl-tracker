import {
  MatchCategoryMismatchError,
  MissingRequiredFieldError,
  TrophyAwardCompetitionGroupMismatchError,
  TrophyAwardRecipientMismatchError,
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

  it('translates a trophy award recipient mismatch error into a BAD_REQUEST reply', async () => {
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw new TrophyAwardRecipientMismatchError('wrong recipient');
      }),
    ).rejects.toBeInstanceOf(BadRequestReply);
    expect(errors.BAD_REQUEST).toHaveBeenCalledWith({
      message: 'wrong recipient',
    });
  });

  it('translates a trophy award competition group mismatch error into a BAD_REQUEST reply', async () => {
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw new TrophyAwardCompetitionGroupMismatchError('wrong group');
      }),
    ).rejects.toBeInstanceOf(BadRequestReply);
    expect(errors.BAD_REQUEST).toHaveBeenCalledWith({
      message: 'wrong group',
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

  it('returns one flat success entry per item, in input order', async () => {
    await expect(
      handler.runBatch(TestConflictError, [
        () =>
          Promise.resolve({ entity: { id: 1, name: 'Griff' }, created: true }),
        () =>
          Promise.resolve({ entity: { id: 2, name: 'Morg' }, created: false }),
      ]),
    ).resolves.toEqual([
      { id: 1, name: 'Griff', success: true, created: true },
      { id: 2, name: 'Morg', success: true, created: false },
    ]);
  });

  it('returns an empty array when there are no items', async () => {
    await expect(handler.runBatch(TestConflictError, [])).resolves.toEqual([]);
  });

  it('turns a conflict error into a per-item failure and keeps going', async () => {
    await expect(
      handler.runBatch(TestConflictError, [
        () => {
          throw new TestConflictError('two matches');
        },
        () =>
          Promise.resolve({ entity: { id: 2, name: 'Morg' }, created: true }),
      ]),
    ).resolves.toEqual([
      { success: false, error: 'two matches' },
      { id: 2, name: 'Morg', success: true, created: true },
    ]);
  });

  it('turns a missing-required-field error into a per-item failure', async () => {
    await expect(
      handler.runBatch(TestConflictError, [
        () => {
          throw new MissingRequiredFieldError(
            'Cannot create new eras: missing required field(s): leagueId',
          );
        },
      ]),
    ).resolves.toEqual([
      {
        success: false,
        error: 'Cannot create new eras: missing required field(s): leagueId',
      },
    ]);
  });

  it('turns a match category mismatch error into a per-item failure', async () => {
    await expect(
      handler.runBatch(TestConflictError, [
        () => {
          throw new MatchCategoryMismatchError(
            'Match category cup_final is not valid for competition type season',
          );
        },
      ]),
    ).resolves.toEqual([
      {
        success: false,
        error:
          'Match category cup_final is not valid for competition type season',
      },
    ]);
  });

  it('turns a trophy award recipient mismatch error into a per-item failure', async () => {
    await expect(
      handler.runBatch(TestConflictError, [
        () => {
          throw new TrophyAwardRecipientMismatchError('wrong recipient');
        },
      ]),
    ).resolves.toEqual([
      {
        success: false,
        error: 'wrong recipient',
      },
    ]);
  });

  it('turns a trophy award competition group mismatch error into a per-item failure', async () => {
    await expect(
      handler.runBatch(TestConflictError, [
        () => {
          throw new TrophyAwardCompetitionGroupMismatchError('wrong group');
        },
      ]),
    ).resolves.toEqual([
      {
        success: false,
        error: 'wrong group',
      },
    ]);
  });

  it('propagates an unknown error and abandons the remaining items', async () => {
    const boom = new Error('db is down');
    const later = vi.fn(() =>
      Promise.resolve({ entity: { id: 2, name: 'Morg' }, created: true }),
    );

    await expect(
      handler.runBatch(TestConflictError, [
        () => {
          throw boom;
        },
        later,
      ]),
    ).rejects.toBe(boom);
    expect(later).not.toHaveBeenCalled();
  });

  it('treats a shared domain error as a failure even with no conflict class', async () => {
    await expect(
      handler.runBatch(undefined, [
        () => {
          throw new MissingRequiredFieldError('missing name');
        },
      ]),
    ).resolves.toEqual([{ success: false, error: 'missing name' }]);
  });

  it('propagates a conflict error when no conflict class was supplied', async () => {
    const conflict = new TestConflictError('two matches');
    await expect(
      handler.runBatch(undefined, [
        () => {
          throw conflict;
        },
      ]),
    ).rejects.toBe(conflict);
  });

  it('runs the items sequentially in input order', async () => {
    const order: number[] = [];
    await handler.runBatch(TestConflictError, [
      async () => {
        await Promise.resolve();
        order.push(1);
        return { entity: { id: 1, name: 'Griff' }, created: true };
      },
      () => {
        order.push(2);
        return Promise.resolve({
          entity: { id: 2, name: 'Morg' },
          created: true,
        });
      },
    ]);

    expect(order).toEqual([1, 2]);
  });
});
