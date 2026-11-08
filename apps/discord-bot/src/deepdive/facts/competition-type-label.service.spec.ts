import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CompetitionTypeLabelService } from './competition-type-label.service';

describe('CompetitionTypeLabelService', () => {
  let service: CompetitionTypeLabelService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CompetitionTypeLabelService],
    }).compile();
    service = moduleRef.get(CompetitionTypeLabelService);
  });

  it.each([
    ['season', 'Season'],
    ['cup', 'Cup'],
  ] as const)('labels %s as "%s"', (type, expected) => {
    expect(service.label(type)).toBe(expected);
  });
});
