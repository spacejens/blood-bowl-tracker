import { describe, expect, it, vi } from 'vitest';

import { UpsertHandlerService } from './upsert-handler.service';

class TestConflictError extends Error {}
class ConflictReply extends Error {}

const errors = {
  CONFLICT: vi.fn(
    ({ message }: { message: string }) => new ConflictReply(message),
  ),
};

describe('UpsertHandlerService', () => {
  it('flattens the entity and created flag on success', async () => {
    const handler = new UpsertHandlerService();

    await expect(
      handler.run(errors, TestConflictError, () =>
        Promise.resolve({
          entity: { id: 1, name: 'Griff' },
          created: true,
        }),
      ),
    ).resolves.toEqual({ id: 1, name: 'Griff', created: true });
  });

  it('translates the entity conflict error into a CONFLICT reply', async () => {
    const handler = new UpsertHandlerService();

    await expect(
      handler.run(errors, TestConflictError, () => {
        throw new TestConflictError('two matches');
      }),
    ).rejects.toBeInstanceOf(ConflictReply);
    expect(errors.CONFLICT).toHaveBeenCalledWith({ message: 'two matches' });
  });

  it('rethrows any other error untouched', async () => {
    const handler = new UpsertHandlerService();
    const boom = new Error('db is down');

    await expect(
      handler.run(errors, TestConflictError, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
