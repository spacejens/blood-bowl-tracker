import {
  TP_ERA_RULES_SETS_PROVIDER,
  TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
} from '@blood-bowl-tracker/import-tp-live';
import { Global, Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { SourceModule } from './source.module';

/**
 * Supplies packages/import-tp-live's team/player import with this tool's
 * config-file-driven inputs. Global, because the package's modules resolve
 * these tokens without importing any tool module.
 */
@Global()
@Module({
  imports: [SourceModule, EraDataConfigModule],
  providers: [
    {
      provide: TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
      useExisting: ExternalSystemNameConfigService,
    },
    {
      provide: TP_ERA_RULES_SETS_PROVIDER,
      useExisting: EraDataConfigService,
    },
  ],
  exports: [TP_EXTERNAL_SYSTEM_NAME_PROVIDER, TP_ERA_RULES_SETS_PROVIDER],
})
export class TpRosterImportProvidersModule {}
