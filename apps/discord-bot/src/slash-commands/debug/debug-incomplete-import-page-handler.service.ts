import {
  DEBUG_COMMAND_ROLE_ID,
  DiscordClientService,
  MemberRoleAccessService,
} from '@blood-bowl-tracker/discord-client';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ButtonInteraction, InteractionReplyOptions } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE } from '../../error-messages';
import { DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX } from './debug-custom-ids';
import { DebugIncompleteImportReplyService } from './debug-incomplete-import-reply.service';

/**
 * Answers the `/debugincompleteimport` Previous/Next buttons: the custom id's
 * remainder is the page to show, and anything that is not a positive integer shows page 1.
 *
 * `DiscordClientService` role-checks slash commands but not buttons, so this
 * handler applies the `debug` restriction itself, against the same
 * `DEBUG_COMMAND_ROLE_ID` the command is gated by - otherwise a button held
 * from before the role was configured, or after it was revoked, would bypass
 * it. That makes this one of the few button handlers that reads
 * `interaction.member`; `DebugRetriggerHandlerService` forwards `member` into
 * the synthetic interaction it builds, so retriggering a recorded click of
 * these buttons is checked too.
 */
@Injectable()
export class DebugIncompleteImportPageHandlerService implements OnModuleInit {
  constructor(
    private readonly reply: DebugIncompleteImportReplyService,
    private readonly discordClient: DiscordClientService,
    private readonly memberRoleAccess: MemberRoleAccessService,
    @Inject(DEBUG_COMMAND_ROLE_ID)
    private readonly debugRoleId: string | undefined,
  ) {}

  onModuleInit(): void {
    this.discordClient.registerButtonHandler(
      DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX,
      (interaction) => this.handle(interaction),
    );
  }

  async handle(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    if (
      this.debugRoleId !== undefined &&
      !this.memberRoleAccess.hasRole(interaction.member, this.debugRoleId)
    ) {
      return {
        content: DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE,
        flags: MessageFlags.Ephemeral,
      };
    }
    const segment = interaction.customId.slice(
      DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX.length,
    );
    const page = /^[1-9]\d*$/.test(segment) ? Number(segment) : 1;
    return this.reply.buildReply(page);
  }
}
