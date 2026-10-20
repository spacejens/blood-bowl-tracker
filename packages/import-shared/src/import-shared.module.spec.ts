import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CompetitionTypeService } from './competition-type.service';
import { ImportResultService } from './import-result.service';
import { ImportSharedModule } from './import-shared.module';
import { NameExternalIdService } from './name-external-id.service';
import { UpsertRecorderService } from './upsert-recorder.service';

describe('ImportSharedModule', () => {
  it('provides every shared service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ImportSharedModule],
    }).compile();

    for (const provider of [
      CompetitionTypeService,
      ImportResultService,
      NameExternalIdService,
      UpsertRecorderService,
    ]) {
      expect(moduleRef.get(provider)).toBeInstanceOf(provider);
    }
  });
});
