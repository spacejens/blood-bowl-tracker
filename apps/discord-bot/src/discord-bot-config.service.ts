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

  /**
   * Whether the standby machine announces itself on startup. Optional and
   * default-on, so existing deployments keep announcing without any config
   * change; setting it to "false" silences the standby's boot message in
   * environments that restart often, where it is pure noise. Only an explicit
   * "false" disables it — an unset or unrecognised value keeps today's
   * behaviour rather than silently turning the announcement off. Unlike the
   * getters above it never throws: there is nothing to fail fast about when
   * the variable is genuinely optional.
   */
  getStandbyStartupMessageEnabled(): boolean {
    const value = this.configService.get<string>(
      'STANDBY_STARTUP_MESSAGE_ENABLED',
    );
    if (!value) return true;
    return value.trim().toLowerCase() !== 'false';
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
