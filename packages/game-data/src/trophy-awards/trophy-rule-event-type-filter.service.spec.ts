import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { extractAllFilterValues } from '../shared/query-assertions.test-helpers';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';

describe('TrophyRuleEventTypeFilterService', () => {
  let service: TrophyRuleEventTypeFilterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyRuleEventTypeFilterService],
    }).compile();
    service = moduleRef.get(TrophyRuleEventTypeFilterService);
  });

  it('builds no condition at all when neither list is curated', () => {
    expect(
      service.buildAll({ actionTypes: [], consequenceTypes: [] }),
    ).toBeUndefined();
    expect(
      service.buildAny({ actionTypes: [], consequenceTypes: [] }),
    ).toBeUndefined();
  });

  it('buildAll requires both curated sides of a compound rule', () => {
    const condition = service.buildAll({
      actionTypes: ['foul'],
      consequenceTypes: ['casualty', 'death'],
    });
    expect(extractAllFilterValues(condition)).toEqual([
      'foul',
      'casualty',
      'death',
    ]);
  });

  it('buildAll uses only the curated side when the other is empty', () => {
    const condition = service.buildAll({
      actionTypes: ['touchdown'],
      consequenceTypes: [],
    });
    expect(extractAllFilterValues(condition)).toEqual(['touchdown']);
  });

  it('buildAny matches any curated type, for exclusion', () => {
    const condition = service.buildAny({
      actionTypes: ['mvp_award'],
      consequenceTypes: ['concession'],
    });
    expect(extractAllFilterValues(condition)).toEqual([
      'mvp_award',
      'concession',
    ]);
  });
});
