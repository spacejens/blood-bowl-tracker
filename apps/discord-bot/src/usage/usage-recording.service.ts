import { UsageTrackingService } from '@blood-bowl-tracker/discord-bot-usage';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';

/**
 * Records every handled Discord interaction into the `discord_bot_usage`
 * schema, by listening on `DiscordClientService`'s interaction-handled hook.
 * This is the schema's only writer.
 *
 * Failures are deliberately not caught here: the Discord client logs a
 * failing listener as a warning, and has already replied to the user by the
 * time a listener runs, so a recording failure can never affect a reply.
 */
@Injectable()
export class UsageRecordingService implements OnModuleInit {
  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly usageTracking: UsageTrackingService,
  ) {}

  onModuleInit(): void {
    this.discordClient.registerInteractionHandledListener((interaction) =>
      this.usageTracking.recordInteraction(interaction),
    );
  }
}
