import type { PositionKeyword } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PositionKeywordsSectionService } from './position-keywords-section.service';

describe('PositionKeywordsSectionService', () => {
  let service: PositionKeywordsSectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PositionKeywordsSectionService],
    }).compile();
    service = moduleRef.get(PositionKeywordsSectionService);
  });

  function keyword(
    overrides: Partial<PositionKeyword> & { keywordName: string },
  ): PositionKeyword {
    return {
      rulesSetId: 25,
      rulesSetName: 'BB2025',
      keywordId: 1,
      kind: 'species',
      ...overrides,
    };
  }

  it('says nothing for a position with no keywords', () => {
    expect(service.build([])).toEqual([]);
  });

  it('writes one line naming the rules set and the keywords', () => {
    expect(
      service.build([
        keyword({ keywordId: 1, keywordName: 'Goblin' }),
        keyword({ keywordId: 2, keywordName: 'Undead' }),
      ]),
    ).toEqual(['BB2025 keywords: Goblin, Undead']);
  });

  it('writes one line per rules set, in the order given', () => {
    expect(
      service.build([
        keyword({ keywordId: 1, keywordName: 'Goblin' }),
        keyword({
          rulesSetId: 26,
          rulesSetName: 'BB2026',
          keywordId: 2,
          keywordName: 'Undead',
        }),
      ]),
    ).toEqual(['BB2025 keywords: Goblin', 'BB2026 keywords: Undead']);
  });

  it('keeps a positional or special keyword unmarked', () => {
    expect(
      service.build([
        keyword({ keywordId: 1, keywordName: 'Big Guy', kind: 'positional' }),
      ]),
    ).toEqual(['BB2025 keywords: Big Guy']);
  });
});
