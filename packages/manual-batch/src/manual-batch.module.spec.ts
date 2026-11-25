import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ManualBatchModule } from './manual-batch.module';
import { ManualBatchLayoutService } from './manual-batch-layout.service';
import { ManualBatchNameService } from './manual-batch-name.service';

describe('ManualBatchModule', () => {
  it('wires the real dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ManualBatchModule],
    }).compile();

    expect(moduleRef.get(ManualBatchLayoutService)).toBeInstanceOf(
      ManualBatchLayoutService,
    );
    expect(moduleRef.get(ManualBatchNameService)).toBeInstanceOf(
      ManualBatchNameService,
    );
  });
});
