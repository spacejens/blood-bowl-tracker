import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpTeamsImportService } from './teams/tp-teams-import.service';
import { TpRosterEraErrorService } from './tp-roster-era-error.service';

/**
 * The team and player upserts, shared by tools/import-tp's bulk run and this
 * package's live import. The importing app provides
 * TP_EXTERNAL_SYSTEM_NAME_PROVIDER from a `@Global()` module, and
 * `@blood-bowl-tracker/api-client`'s API_CLIENT (which ImportModule's
 * services call through).
 */
@Module({
  imports: [ImportModule],
  providers: [TpTeamsImportService, TpRosterEraErrorService],
  exports: [TpTeamsImportService],
})
export class TpRosterImportModule {}
