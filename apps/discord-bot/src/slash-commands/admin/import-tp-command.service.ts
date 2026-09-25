import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { TpPageClassifierService } from '@blood-bowl-tracker/tp-paths';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';

import { DiscordBotConfigService } from '../../discord-bot-config.service';
import { IMPORT_TP_UNSUPPORTED_URL_MESSAGE } from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { ImportTpReplyService } from './import-tp-reply.service';
import { TpImportDispatchService } from './tp-import-dispatch.service';

/**
 * The `/importtp` slash command: imports whatever TP page a URL points to —
 * a competition, a match, a team roster or the official team list — right
 * now, so a league administrator need not wait for automatic imports, or
 * can recover when they missed something.
 *
 * Restricted to the deployment's `admin` role, and deferred: an import
 * fetches from TP with deliberate pacing between requests, so it routinely
 * outlasts Discord's 3-second acknowledgement window. The reply is always
 * ephemeral. `era` overrides era auto-resolution, which is also the way to
 * force through a competition whose teams' eras cannot be reconciled.
 *
 * Classification lives in packages/tp-paths, the import dispatch in
 * `TpImportDispatchService` and the reply in `ImportTpReplyService`; this
 * service only reads the options and wires the three together.
 */
@Injectable()
export class ImportTpCommandService implements OnModuleInit {
  constructor(
    private readonly config: DiscordBotConfigService,
    private readonly classifier: TpPageClassifierService,
    private readonly dispatch: TpImportDispatchService,
    private readonly reply: ImportTpReplyService,
    private readonly registry: SlashCommandRegistryService,
  ) {}

  onModuleInit(): void {
    // Read the required TP settings now, so a missing one fails startup
    // rather than the first /importtp.
    this.config.getTpExternalSystemName();
    this.config.getTpFrontendBaseUrl();
    this.registry.register(this.buildCommand());
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'importtp',
      description:
        'Admin: Import a TP competition, match, team or official teams page',
      restrictedRole: 'admin',
      deferEphemeral: true,
      options: [
        {
          name: 'url',
          description: 'The TP page to import',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'era',
          description:
            'The era to import under (optional; resolved automatically when omitted)',
          type: ApplicationCommandOptionType.String,
        },
      ],
      execute: (interaction) => this.execute(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const url = interaction.options.getString('url', true);
    const era = interaction.options.getString('era')?.trim() || undefined;
    const page = this.classifier.classify(
      url,
      this.config.getTpFrontendBaseUrl(),
    );
    if (page.kind === 'unknown') {
      return {
        content: IMPORT_TP_UNSUPPORTED_URL_MESSAGE,
        flags: MessageFlags.Ephemeral,
      };
    }
    return this.reply.build(await this.dispatch.dispatch({ page, era }));
  }
}
