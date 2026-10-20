import { Module } from '@nestjs/common';

import { CompetitionTypeService } from './competition-type.service';
import { ImportResultService } from './import-result.service';
import { NameExternalIdService } from './name-external-id.service';
import { UpsertRecorderService } from './upsert-recorder.service';

/**
 * The import rules both the client-side packages/import and the server-side
 * packages/import-tp-live must apply identically. Pure and I/O-free, so
 * either side can depend on it without gaining the other's dependencies.
 */
@Module({
  providers: [
    CompetitionTypeService,
    ImportResultService,
    NameExternalIdService,
    UpsertRecorderService,
  ],
  exports: [
    CompetitionTypeService,
    ImportResultService,
    NameExternalIdService,
    UpsertRecorderService,
  ],
})
export class ImportSharedModule {}
