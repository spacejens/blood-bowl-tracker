import { describe, expect, it } from 'vitest';

import {
  ListPositionRulesSetKeywordsSchema,
  PositionRulesSetKeywordRefSchema,
  SyncPositionRulesSetKeywordsResultSchema,
  SyncPositionRulesSetKeywordsSchema,
} from './position-rules-set-keyword';

describe('SyncPositionRulesSetKeywordsSchema', () => {
  it('accepts entries keyed by their natural triple', () => {
    expect(
      SyncPositionRulesSetKeywordsSchema.parse({
        entries: [{ positionId: 1, rulesSetId: 2, keywordId: 3 }],
      }),
    ).toEqual({ entries: [{ positionId: 1, rulesSetId: 2, keywordId: 3 }] });
  });

  it('accepts an empty batch', () => {
    expect(SyncPositionRulesSetKeywordsSchema.parse({ entries: [] })).toEqual({
      entries: [],
    });
  });

  it('rejects a non-integer id', () => {
    expect(() =>
      SyncPositionRulesSetKeywordsSchema.parse({
        entries: [{ positionId: 1.5, rulesSetId: 2, keywordId: 3 }],
      }),
    ).toThrow();
  });
});

describe('SyncPositionRulesSetKeywordsResultSchema', () => {
  it('carries one id per entry', () => {
    expect(
      SyncPositionRulesSetKeywordsResultSchema.parse({
        positionRulesSetKeywordIds: [10, 11],
      }),
    ).toEqual({ positionRulesSetKeywordIds: [10, 11] });
  });
});

describe('PositionRulesSetKeywordRefSchema', () => {
  it('omits the position id the caller already supplied', () => {
    expect(
      PositionRulesSetKeywordRefSchema.parse({
        rulesSetId: 2,
        keywordId: 3,
        keywordName: 'Goblin',
        kind: 'species',
      }),
    ).toEqual({
      rulesSetId: 2,
      keywordId: 3,
      keywordName: 'Goblin',
      kind: 'species',
    });
  });
});

describe('ListPositionRulesSetKeywordsSchema', () => {
  it('takes one position id', () => {
    expect(ListPositionRulesSetKeywordsSchema.parse({ positionId: 4 })).toEqual(
      { positionId: 4 },
    );
  });
});
