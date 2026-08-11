import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  BatchBufferService,
  DEFAULT_BATCH_CHUNK_SIZE,
} from './batch-buffer.service';
import { ImportResultService } from './import-result.service';
import type { ImportError } from './types';

interface TestItem {
  name: string;
}

describe('BatchBufferService', () => {
  let service: BatchBufferService;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    importResults = mock<ImportResultService>();
    // `error` is a pure identity field copy with no branching, so this cannot
    // drift from the real ImportResultService — the same exemption
    // bbl-match-events-import.service.spec.ts documents.
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BatchBufferService,
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(BatchBufferService);
  });

  function makeBuffer(
    upsertBatch: (
      items: TestItem[],
    ) => Promise<
      readonly ({ success: true } | { success: false; error: string })[]
    >,
    options: { chunkSize?: number; errors?: ImportError[] } = {},
  ) {
    const errors = options.errors ?? [];
    const buffer = service.create<TestItem>({
      upsertBatch,
      errors,
      buildErrorMessage: (item, message) =>
        `Failed to import thing "${item.name}": ${message}`,
      chunkSize: options.chunkSize,
    });
    return { buffer, errors };
  }

  it('defaults the chunk size to 500 and starts empty', () => {
    const { buffer } = makeBuffer(() => Promise.resolve([]));
    expect(buffer.chunkSize).toBe(DEFAULT_BATCH_CHUNK_SIZE);
    expect(DEFAULT_BATCH_CHUNK_SIZE).toBe(500);
    expect(buffer.pending).toEqual([]);
  });

  it('honours an explicit chunk size', () => {
    const { buffer } = makeBuffer(() => Promise.resolve([]), { chunkSize: 2 });
    expect(buffer.chunkSize).toBe(2);
  });

  it('buffers without sending until the chunk is full', async () => {
    const upsertBatch = vi.fn(() =>
      Promise.resolve([{ success: true } as const]),
    );
    const { buffer } = makeBuffer(upsertBatch, { chunkSize: 2 });

    const imported = await service.add(buffer, { name: 'a' });

    expect(imported).toBe(0);
    expect(upsertBatch).not.toHaveBeenCalled();
    expect(buffer.pending).toEqual([{ name: 'a' }]);
  });

  it('sends one chunk when it fills up and resets the buffer', async () => {
    const upsertBatch = vi.fn(() =>
      Promise.resolve([{ success: true } as const, { success: true } as const]),
    );
    const { buffer, errors } = makeBuffer(upsertBatch, { chunkSize: 2 });

    await service.add(buffer, { name: 'a' });
    const imported = await service.add(buffer, { name: 'b' });

    expect(imported).toBe(2);
    expect(upsertBatch).toHaveBeenCalledTimes(1);
    expect(upsertBatch).toHaveBeenCalledWith([{ name: 'a' }, { name: 'b' }]);
    expect(buffer.pending).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('flushes a partial trailing chunk', async () => {
    const upsertBatch = vi.fn(() =>
      Promise.resolve([{ success: true } as const]),
    );
    const { buffer } = makeBuffer(upsertBatch, { chunkSize: 5 });

    await service.add(buffer, { name: 'a' });
    const imported = await service.flush(buffer);

    expect(imported).toBe(1);
    expect(upsertBatch).toHaveBeenCalledWith([{ name: 'a' }]);
    expect(buffer.pending).toEqual([]);
  });

  it('does not send anything when flushing an empty buffer', async () => {
    const upsertBatch = vi.fn(() => Promise.resolve([]));
    const { buffer } = makeBuffer(upsertBatch);

    await expect(service.flush(buffer)).resolves.toBe(0);
    expect(upsertBatch).not.toHaveBeenCalled();
  });

  it('records a per-item failure against that item and keeps its siblings', async () => {
    const upsertBatch = vi.fn(() =>
      Promise.resolve([
        { success: false as const, error: 'conflicting external ids' },
        { success: true as const },
      ]),
    );
    const { buffer, errors } = makeBuffer(upsertBatch, { chunkSize: 2 });

    await service.add(buffer, { name: 'a' });
    const imported = await service.add(buffer, { name: 'b' });

    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { name: 'a' },
        message: 'Failed to import thing "a": conflicting external ids',
      },
    ]);
  });

  it('records an error for an item the response has no result for', async () => {
    const upsertBatch = vi.fn(() =>
      Promise.resolve([{ success: true } as const]),
    );
    const { buffer, errors } = makeBuffer(upsertBatch, { chunkSize: 2 });

    await service.add(buffer, { name: 'a' });
    const imported = await service.add(buffer, { name: 'b' });

    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { name: 'b' },
        message:
          'Failed to import thing "b": batch response was missing a result for this item',
      },
    ]);
  });

  it('records one error per buffered item when the whole request fails', async () => {
    const upsertBatch = vi.fn(() => Promise.reject(new Error('fetch failed')));
    const { buffer, errors } = makeBuffer(upsertBatch, { chunkSize: 2 });

    await service.add(buffer, { name: 'a' });
    const imported = await service.add(buffer, { name: 'b' });

    expect(imported).toBe(0);
    expect(errors).toEqual([
      {
        item: { name: 'a' },
        message:
          'Failed to import thing "a": batch request failed: fetch failed',
      },
      {
        item: { name: 'b' },
        message:
          'Failed to import thing "b": batch request failed: fetch failed',
      },
    ]);
    expect(buffer.pending).toEqual([]);
  });

  it('stringifies a non-Error transport rejection', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const upsertBatch = vi.fn(() => Promise.reject('boom'));
    const { buffer, errors } = makeBuffer(upsertBatch, { chunkSize: 1 });

    await service.add(buffer, { name: 'a' });

    expect(errors).toEqual([
      {
        item: { name: 'a' },
        message: 'Failed to import thing "a": batch request failed: boom',
      },
    ]);
  });
});
