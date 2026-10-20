import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CompetitionTypeService } from './competition-type.service';

describe('CompetitionTypeService', () => {
  let service: CompetitionTypeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CompetitionTypeService],
    }).compile();
    service = moduleRef.get(CompetitionTypeService);
  });

  it('classifies a same-day span as a cup', () => {
    expect(service.fromSpanDays(0)).toBe('cup');
  });

  it('classifies a span of exactly three days as a cup', () => {
    expect(service.fromSpanDays(3)).toBe('cup');
  });

  it('classifies a span just over three days as a season', () => {
    expect(service.fromSpanDays(3 + 1 / 86400)).toBe('season');
  });

  it('classifies a long span as a season', () => {
    expect(service.fromSpanDays(152)).toBe('season');
  });
});
