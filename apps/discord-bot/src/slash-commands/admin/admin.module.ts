import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { TpImportModule } from '../../tp-import/tp-import.module';
import { SlashCommandRegistryModule } from '../slash-command-registry.module';
import { ImportTpCommandService } from './import-tp-command.service';
import { ImportTpReplyService } from './import-tp-reply.service';

/**
 * League-administrator commands, restricted to the deployment's `admin`
 * role: currently `/importtp`.
 *
 * `TpImportModule` supplies the TP import dispatch and error-list fitting shared
 * with the TP feed; `TpPathsModule` the URL classifier. `DiscordBotConfigService` is global.
 * `SlashCommandRegistryModule` supplies the shared registry singleton.
 */
@Module({
  imports: [SlashCommandRegistryModule, TpImportModule, TpPathsModule],
  providers: [ImportTpCommandService, ImportTpReplyService],
})
export class AdminModule {}
