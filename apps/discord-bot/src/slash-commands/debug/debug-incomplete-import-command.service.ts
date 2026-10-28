import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';

import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { DebugIncompleteImportReplyService } from './debug-incomplete-import-reply.service';

/**
 * The `/debugincompleteimport` slash command: the teams holding players with
 * incomplete import data, grouped by coach with the largest problems first,
 * so the size of the problem is visible and the list can serve as a
 * correction task list.
 *
 * `debug`-prefixed maintainer tooling with `restrictedRole: 'debug'`, global
 * (incomplete data is not tied to a guild) and ephemeral, like its siblings.
 * No options: the report always covers everything. The reply itself, and its
 * Previous/Next pagination, is built by `DebugIncompleteImportReplyService`,
 * shared with `DebugIncompleteImportPageHandlerService`.
 */
@Injectable()
export class DebugIncompleteImportCommandService implements OnModuleInit {
  constructor(
    private readonly registry: SlashCommandRegistryService,
    private readonly reply: DebugIncompleteImportReplyService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'debugincompleteimport',
      description: 'Debug: List teams with incomplete import data',
      restrictedRole: 'debug',
      execute: () => this.reply.buildReply(1),
    };
  }
}
