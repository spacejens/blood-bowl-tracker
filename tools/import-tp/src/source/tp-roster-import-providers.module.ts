import { TP_EXTERNAL_SYSTEM_NAME_PROVIDER } from '@blood-bowl-tracker/import-tp-live';
import { Global, Module } from '@nestjs/common';

import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { SourceModule } from './source.module';

/**
 * Supplies packages/import-tp-live's team/player import with this tool's
 * config-file-driven inputs. Global, because the package's modules resolve
 * these tokens without importing any tool module.
 */
@Global()
@Module({
  imports: [SourceModule],
  providers: [
    {
      provide: TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
      useExisting: ExternalSystemNameConfigService,
    },
  ],
  exports: [TP_EXTERNAL_SYSTEM_NAME_PROVIDER],
})
export class TpRosterImportProvidersModule {}
