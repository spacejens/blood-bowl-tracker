import { ImportTpLiveModule } from '@blood-bowl-tracker/import-tp-live';
import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { SlashCommandRegistryModule } from '../slash-command-registry.module';
import { ImportTpCommandService } from './import-tp-command.service';
import { ImportTpReplyService } from './import-tp-reply.service';
import { TpImportDispatchService } from './tp-import-dispatch.service';

/**
 * League-administrator commands, restricted to the deployment's `admin`
 * role: currently `/importtp`.
 *
 * `ImportTpLiveModule` needs `TP_CONNECTION_PROVIDER` and packages/db's
 * `DB`, both supplied by `@Global()` modules `AppModule` registers
 * (`TpConnectionModule`, `DbModule`). `DiscordBotConfigService` is global
 * too. `SlashCommandRegistryModule` supplies the shared registry singleton.
 */
@Module({
  imports: [SlashCommandRegistryModule, ImportTpLiveModule, TpPathsModule],
  providers: [
    ImportTpCommandService,
    TpImportDispatchService,
    ImportTpReplyService,
  ],
})
export class AdminModule {}
