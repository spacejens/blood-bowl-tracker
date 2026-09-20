import { KeywordsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReferenceResolverService } from '../references/reference-resolver.service';
import { KeywordsProcessor } from './keywords.processor';

describe('KeywordsProcessor', () => {
  let processor: KeywordsProcessor;
  let keywordsImport: MockProxy<KeywordsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    keywordsImport = mock<KeywordsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        KeywordsProcessor,
        { provide: KeywordsImportService, useValue: keywordsImport },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(KeywordsProcessor);
  });

  function context(keywords: unknown[]) {
    return {
      data: { keywords },
      systemIds: new Map([['Name', 1]]),
      errors: [],
    } as never;
  }

  it('upserts each curated keyword and counts the successes', async () => {
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Goblin' },
    ]);
    keywordsImport.upsert.mockResolvedValue({ id: 7, created: true } as never);
    await expect(
      processor.process(
        context([
          {
            name: 'Goblin',
            kind: 'species',
            externalIds: [{ system: 'Name', id: 'Goblin' }],
          },
        ]),
      ),
    ).resolves.toBe(1);
    expect(keywordsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Goblin',
        kind: 'species',
        externalIds: [{ externalSystemId: 1, externalId: 'Goblin' }],
      },
      [],
    );
  });

  it('does not count a keyword whose upsert failed', async () => {
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Goblin' },
    ]);
    keywordsImport.upsert.mockResolvedValue(undefined);
    await expect(
      processor.process(
        context([
          {
            name: 'Goblin',
            kind: 'species',
            externalIds: [{ system: 'Name', id: 'Goblin' }],
          },
        ]),
      ),
    ).resolves.toBe(0);
  });

  it('does nothing for an empty section', async () => {
    await expect(processor.process(context([]))).resolves.toBe(0);
    expect(keywordsImport.upsert).not.toHaveBeenCalled();
  });
});
