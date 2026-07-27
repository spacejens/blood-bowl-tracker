import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRawCodeLabelService } from './tp-raw-code-labels.service';

describe('TpRawCodeLabelService', () => {
  let service: TpRawCodeLabelService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRawCodeLabelService],
    }).compile();
    service = moduleRef.get(TpRawCodeLabelService);
  });

  it('shows the code and its label for a known code', () => {
    expect(service.describe(4)).toBe('4 (touchdown)');
    expect(service.describe(31)).toBe('31 (foul)');
  });

  it('shows the bare code for a code it has no label for', () => {
    expect(service.describe(99)).toBe('99');
  });
});
