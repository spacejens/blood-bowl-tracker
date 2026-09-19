import { describe, expect, it } from 'vitest';

import {
  KeywordCatalogEntrySchema,
  ListKeywordsSchema,
  UpsertKeywordSchema,
} from './keyword';

describe('UpsertKeywordSchema', () => {
  it('accepts a full entry', () => {
    expect(
      UpsertKeywordSchema.parse({
        name: 'Goblin',
        kind: 'species',
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
      }),
    ).toEqual({
      name: 'Goblin',
      kind: 'species',
      externalIds: [{ externalSystemId: 1, externalId: '111' }],
    });
  });

  it('accepts an entry that only addresses the row', () => {
    expect(
      UpsertKeywordSchema.parse({
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
      }),
    ).toEqual({ externalIds: [{ externalSystemId: 1, externalId: '111' }] });
  });

  it('rejects an empty name', () => {
    expect(() =>
      UpsertKeywordSchema.parse({
        name: '',
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
      }),
    ).toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      UpsertKeywordSchema.parse({
        kind: 'race',
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
      }),
    ).toThrow();
  });

  it('rejects an entry with no external ids', () => {
    expect(() => UpsertKeywordSchema.parse({ externalIds: [] })).toThrow();
  });
});

describe('ListKeywordsSchema', () => {
  it('requires an integer external system id', () => {
    expect(ListKeywordsSchema.parse({ externalSystemId: 2 })).toEqual({
      externalSystemId: 2,
    });
    expect(() => ListKeywordsSchema.parse({ externalSystemId: 1.5 })).toThrow();
  });
});

describe('KeywordCatalogEntrySchema', () => {
  it('carries the keyword id, name, kind and the external id', () => {
    expect(
      KeywordCatalogEntrySchema.parse({
        keywordId: 7,
        name: 'Goblin',
        kind: 'species',
        externalId: '111',
      }),
    ).toEqual({
      keywordId: 7,
      name: 'Goblin',
      kind: 'species',
      externalId: '111',
    });
  });
});
