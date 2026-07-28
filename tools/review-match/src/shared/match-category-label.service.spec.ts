import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MatchCategoryLabelService } from './match-category-label.service';

describe('MatchCategoryLabelService', () => {
  let service: MatchCategoryLabelService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MatchCategoryLabelService],
    }).compile();
    service = moduleRef.get(MatchCategoryLabelService);
  });

  it.each([
    ['normal', 'Normal'],
    ['cup_final', 'Cup Final'],
    ['season_semi_final', 'Season Semi Final'],
    ['season_final', 'Season Final'],
    ['season_bronze', 'Season Bronze'],
    ['season_qualifier', 'Season Qualifier'],
  ] as const)('renders %s as %s', (category, expected) => {
    expect(service.label(category)).toBe(expected);
  });
});
