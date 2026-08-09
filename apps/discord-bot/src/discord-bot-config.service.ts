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

  getStartupMessageDiscordChannel(): string {
    return this.getRequired('STARTUP_MESSAGE_DISCORD_CHANNEL');
  }

  getRandomInsightsCron(): string {
    return this.getRequired('RANDOM_INSIGHTS_CRON');
  }

  getRandomInsightsDiscordChannel(): string {
    return this.getRequired('RANDOM_INSIGHTS_DISCORD_CHANNEL');
  }

  getRandomInsightsFilterProbability(): number {
    return this.getRequiredPercent('RANDOM_INSIGHTS_FILTER_PROBABILITY');
  }

  getRandomInsightsFilterCurrentEraProbability(): number {
    return this.getRequiredPercent(
      'RANDOM_INSIGHTS_FILTER_CURRENT_ERA_PROBABILITY',
    );
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

  /** An integer percentage (0-100); anything else fails fast at startup. */
  private getRequiredPercent(key: string): number {
    const value = Number(this.getRequired(key));
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new Error(`${key} must be an integer between 0 and 100`);
    }
    return value;
  }
}
