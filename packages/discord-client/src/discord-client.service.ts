import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client, GatewayIntentBits } from 'discord.js';

export const DISCORD_BOT_TOKEN = Symbol('DISCORD_BOT_TOKEN');

@Injectable()
export class DiscordClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordClientService.name);
  private readonly client: Client;

  constructor(@Inject(DISCORD_BOT_TOKEN) private readonly token: string) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
  }

  async onModuleInit(): Promise<void> {
    this.client.on('error', (error) => {
      this.logger.error('Discord client error', error);
    });
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', () => {
        this.logger.log(`Logged in as ${this.client.user?.tag ?? 'unknown'}`);
        resolve();
      });
      this.client.login(this.token).catch(reject);
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
}
