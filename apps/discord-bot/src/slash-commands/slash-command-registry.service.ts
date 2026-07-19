import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

/**
 * `DiscordClientService.registerCommands` REPLACES a guild's entire command
 * list on every call, so every slash command must be registered in one call.
 * Command services register their definition here during `onModuleInit`; this
 * registry flushes the full collected list to Discord once, on
 * `onApplicationBootstrap` (which runs after all `onModuleInit` hooks).
 */
@Injectable()
export class SlashCommandRegistryService implements OnApplicationBootstrap {
  private readonly commands: SlashCommandDefinition[] = [];

  constructor(private readonly discordClient: DiscordClientService) {}

  register(command: SlashCommandDefinition): void {
    this.commands.push(command);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.discordClient.registerCommands(this.commands);
  }
}
