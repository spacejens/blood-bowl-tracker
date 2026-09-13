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

  /**
   * Every registered definition, in registration order - what a caller needs
   * to reason about the *shape* of the live command surface rather than to
   * invoke one command (which is `findByName`'s job). `/debugfilterusage`
   * reads it to learn which of each command's options are declared optional.
   *
   * A shallow copy: the internal array is the single source of truth that
   * `flush()` sends to Discord, and a caller appending to or splicing the
   * returned list must not be able to change what gets registered.
   */
  all(): SlashCommandDefinition[] {
    return [...this.commands];
  }

  async flush(): Promise<void> {
    await this.discordClient.registerCommands(this.commands);
  }
}
