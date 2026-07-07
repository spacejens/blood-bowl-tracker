import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DiscordBotConfigService {
  constructor(private readonly configService: ConfigService) {}

  getDatabaseUrl(): string {
    return this.getRequired('DATABASE_URL');
  }

  getDiscordBotToken(): string {
    return this.getRequired('DISCORD_BOT_TOKEN');
  }

  getDiscordChannelId(): string {
    return this.getRequired('DISCORD_CHANNEL_ID');
  }

  getPort(): number {
    const port = this.configService.get<string>('PORT');
    return port ? Number(port) : 3000;
  }

  private getRequired(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }
}
