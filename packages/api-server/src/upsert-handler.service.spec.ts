import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConflictErrors } from './upsert-handler.service';
import { UpsertHandlerService } from './upsert-handler.service';

class TestConflictError extends Error {}
class ConflictReply extends Error {}

describe('UpsertHandlerService', () => {
  let handler: UpsertHandlerService;
  let errors: ConflictErrors;

  beforeEach(async () => {
    errors = {
      CONFLICT: vi.fn(
        ({ message }: { message: string }) => new ConflictReply(message),
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

  it('rethrows any other error untouched', async () => {
    const boom = new Error('db is down');
    await expect(
      handler.run(errors, TestConflictError, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
