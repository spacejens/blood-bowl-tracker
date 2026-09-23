import { Module } from '@nestjs/common';

import { TpRosterPathsService } from './tp-roster-paths.service';

/**
 * TP's URL paths, as TP's own frontend requests them. Pure path building with
 * no I/O, so both a client-only tool (tools/download-tp) and the server-side
 * live import (packages/import-tp-live) can depend on it.
 */
@Module({
  providers: [TpRosterPathsService],
  exports: [TpRosterPathsService],
})
export class TpPathsModule {}
