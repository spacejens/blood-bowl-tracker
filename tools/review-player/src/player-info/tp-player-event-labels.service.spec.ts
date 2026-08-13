import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpPlayerEventLabelsService } from './tp-player-event-labels.service';

describe('TpPlayerEventLabelsService', () => {
  let service: TpPlayerEventLabelsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpPlayerEventLabelsService],
    }).compile();
    service = moduleRef.get(TpPlayerEventLabelsService);
  });

  it('describes a known player-attributed code', () => {
    expect(service.describe(4)).toBe('4 (touchdown)');
  });

  it('shows an unknown code bare', () => {
    expect(service.describe(99)).toBe('99');
  });
});
