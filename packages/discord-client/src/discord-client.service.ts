import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client, GatewayIntentBits } from 'discord.js';
import type { Interaction } from 'discord.js';

export const DISCORD_BOT_TOKEN = Symbol('DISCORD_BOT_TOKEN');

const READY_TIMEOUT_MS = 30_000;

export interface SlashCommandDefinition {
  name: string;
  description: string;
  execute: () => Promise<string>;
}

@Injectable()
export class DiscordClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordClientService.name);
  private readonly client: Client;
  private readonly commandHandlers = new Map<string, () => Promise<string>>();

  constructor(@Inject(DISCORD_BOT_TOKEN) private readonly token: string) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
  }

  async onModuleInit(): Promise<void> {
    this.client.on('error', (error) => {
      this.logger.error('Discord client error', error);
    });
    this.client.on('interactionCreate', (interaction) => {
      this.handleInteraction(interaction).catch((error) => {
        this.logger.error('Unhandled interaction error', error);
      });
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Discord client did not become ready within ${READY_TIMEOUT_MS}ms`,
          ),
        );
      }, READY_TIMEOUT_MS);
      this.client.once('ready', () => {
        clearTimeout(timeout);
        this.logger.log(`Logged in as ${this.client.user?.tag ?? 'unknown'}`);
        resolve();
      });
      this.client.login(this.token).catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.destroy();
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`Discord channel not found: ${channelId}`);
    }
    if (!channel.isSendable()) {
      throw new Error(`Discord channel is not sendable: ${channelId}`);
    }
    await channel.send(content);
  }

  /**
   * Registers slash commands with every guild the client has joined.
   *
   * `guild.commands.set` REPLACES a guild's entire command list, so all
   * slash commands across the application must be registered via a single
   * call to this method. If another service calls `registerCommands`
   * separately, it will wipe out the commands registered by a previous call.
   */
  async registerCommands(commands: SlashCommandDefinition[]): Promise<void> {
    for (const command of commands) {
      this.commandHandlers.set(command.name, command.execute);
    }
    const commandData = commands.map((command) => ({
      name: command.name,
      description: command.description,
    }));
    for (const guild of this.client.guilds.cache.values()) {
      await guild.commands.set(commandData);
    }
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const handler = this.commandHandlers.get(interaction.commandName);
    if (!handler) {
      return;
    }
    try {
      const content = await handler();
      await interaction.reply(content);
    } catch (error) {
      this.logger.error(
        `Failed to handle /${interaction.commandName} command`,
        error,
      );
      await interaction.reply(
        'Sorry, something went wrong while handling that command.',
      );
    }
  }
}
