import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable } from '@nestjs/common';

/**
 * `DiscordClientService.registerCommands` REPLACES the application's entire
 * global command list on every call, so every slash command must be
 * registered in one call.
 * Command services register their definition here during `onModuleInit`; this
 * registry flushes the full collected list to Discord once, when leader
 * election calls `flush()` after the elected machine's gateway connection is
 * ready — registration needs a connected client.
 */
@Injectable()
export class SlashCommandRegistryService {
  private readonly commands: SlashCommandDefinition[] = [];

  constructor(private readonly discordClient: DiscordClientService) {}

  register(command: SlashCommandDefinition): void {
    this.commands.push(command);
  }

  /**
   * The definition registered under `name`, or `undefined` when nothing
   * registered it. Lets a caller invoke a command's `execute` directly,
   * without going through Discord — which is how `/debuginteractions`
   * retriggers a recorded past command.
   */
  findByName(name: string): SlashCommandDefinition | undefined {
    return this.commands.find((command) => command.name === name);
  }

  async flush(): Promise<void> {
    await this.discordClient.registerCommands(this.commands);
  }
}
