import type { PositionKeyword } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlayerKeywordsSectionService } from './player-keywords-section.service';

describe('PlayerKeywordsSectionService', () => {
  let service: PlayerKeywordsSectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerKeywordsSectionService],
    }).compile();
    service = moduleRef.get(PlayerKeywordsSectionService);
  });

  const goblin: PositionKeyword = {
    rulesSetId: 25,
    rulesSetName: 'BB2025',
    keywordId: 1,
    keywordName: 'Goblin',
    kind: 'species',
  };
  const undead: PositionKeyword = {
    ...goblin,
    keywordId: 2,
    keywordName: 'Undead',
  };
  const otherRulesSet: PositionKeyword = {
    ...goblin,
    rulesSetId: 20,
    rulesSetName: 'BB2020',
    keywordId: 3,
    keywordName: 'Human',
  };

  it('says nothing when the position has no keywords', () => {
    expect(service.build({ rows: [], rulesSetId: 25 })).toEqual([]);
  });

  it('writes one unprefixed line for the resolved rules set', () => {
    expect(service.build({ rows: [goblin, undead], rulesSetId: 25 })).toEqual([
      'Keywords: Goblin, Undead',
    ]);
  });

  it('keeps the keyword order it is given', () => {
    const blitzer: PositionKeyword = {
      ...goblin,
      keywordId: 4,
      keywordName: 'Blitzer',
      kind: 'positional',
    };

    expect(
      service.build({ rows: [undead, blitzer, goblin], rulesSetId: 25 }),
    ).toEqual(['Keywords: Undead, Blitzer, Goblin']);
  });

  it('ignores keywords recorded under another rules set', () => {
    expect(
      service.build({ rows: [goblin, otherRulesSet], rulesSetId: 25 }),
    ).toEqual(['Keywords: Goblin']);
  });

  it('says nothing when only other rules sets have keywords', () => {
    expect(service.build({ rows: [otherRulesSet], rulesSetId: 25 })).toEqual(
      [],
    );
  });
});
