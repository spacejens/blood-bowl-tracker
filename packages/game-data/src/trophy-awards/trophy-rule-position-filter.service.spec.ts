import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { TrophyRulePositionFilterService } from './trophy-rule-position-filter.service';

describe('TrophyRulePositionFilterService', () => {
  let service: TrophyRulePositionFilterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyRulePositionFilterService],
    }).compile();
    service = moduleRef.get(TrophyRulePositionFilterService);
  });

  it('builds no condition at all for an unrestricted rule', () => {
    expect(service.build(undefined)).toBeUndefined();
  });

  it('narrows to the curated positions when a rule restricts them', () => {
    expect(extractAllFilterValues(service.build([7, 9]))).toEqual([7, 9]);
  });

  it('matches nothing when a restriction resolved to no position at all', () => {
    const condition = service.build([]);
    expect(condition).toBeDefined();
    expect(extractAllFilterValues(condition)).toEqual([]);
    expect(sqlText(condition)).toBe('false');
  });
});
