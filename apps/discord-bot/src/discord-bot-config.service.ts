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

  /**
   * Discord role id whose members may run slash commands restricted to the
   * `debug` role. Optional: unset or empty means no role check is applied and
   * those commands behave like any other. Like the getter above it never
   * throws — there is nothing to fail fast about when the variable is
   * genuinely optional.
   */
  getDebugCommandRoleId(): string | undefined {
    return this.configService.get<string>('DEBUG_COMMAND_ROLE_ID') || undefined;
  }

  /**
   * Discord role id whose members may run slash commands restricted to the
   * `admin` role (league-administrator commands such as `/importtp`).
   * Optional and independent of the debug role: unset or empty means no role
   * check is applied to those commands. Never throws, for the same reason as
   * the getter above.
   */
  getAdminCommandRoleId(): string | undefined {
    return this.configService.get<string>('ADMIN_COMMAND_ROLE_ID') || undefined;
  }

  /**
   * The name TP's external system is registered under. Must match
   * `tools/import-tp`'s configured `externalSystemName`, or a live import
   * never finds what the bulk import registered.
   */
  getTpExternalSystemName(): string {
    return this.getRequired('TP_EXTERNAL_SYSTEM_NAME');
  }

  /** TP's frontend base URL, with a trailing slash. */
  getTpFrontendBaseUrl(): string {
    return this.getRequired('TP_FRONTEND_BASE_URL');
  }

  /** TP's backend API base URL, with a trailing slash. */
  getTpBackendApiUrl(): string {
    return this.getRequired('TP_BACKEND_API_URL');
  }

  /**
   * Discord channel id the TP notification feed listens to. Optional: unset or
   * empty turns the whole feature off — the listener never registers a message
   * handler at all, so nothing is parsed and nothing is logged. Like the
   * getters above it never throws, because there is nothing to fail fast about
   * when the variable is genuinely optional.
   */
  getTpFeedSourceDiscordChannel(): string | undefined {
    return (
      this.configService.get<string>('TP_FEED_SOURCE_DISCORD_CHANNEL') ||
      undefined
    );
  }

  /**
   * Discord channel id the parsed TP notifications are echoed to as one line
   * of plain text each. Optional, and independent of the source channel: unset
   * leaves the listener running — messages are still parsed and drift warnings
   * are still logged — but nothing is posted anywhere.
   */
  getTpFeedDebugDiscordChannel(): string | undefined {
    return (
      this.configService.get<string>('TP_FEED_DEBUG_DISCORD_CHANNEL') ||
      undefined
    );
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
