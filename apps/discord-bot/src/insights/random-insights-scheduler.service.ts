import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { InsightsCommandService } from '../slash-commands/insights-command.service';
import { RandomInsightsScopeService } from './random-insights-scope.service';

/** The name this job is registered under in NestJS's SchedulerRegistry. */
export const RANDOM_INSIGHTS_JOB_NAME = 'random-insights';

/**
 * Posts a random insight to Discord on a configured schedule.
 *
 * The cron expression comes from configuration rather than a compile-time
 * `@Cron()` decorator, so the job is built and registered dynamically at
 * bootstrap. An invalid expression throws there (inside the `cron` package),
 * failing startup the same way a missing required env var does.
 *
 * Registered as a provider of AppModule rather than InsightsModule: it depends
 * on InsightsCommandService, which lives in SlashCommandsModule, which imports
 * InsightsModule -- registering it there would make those two modules cyclic.
 */
@Injectable()
export class RandomInsightsSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RandomInsightsSchedulerService.name);

  constructor(
    private readonly insightsCommand: InsightsCommandService,
    private readonly discordClient: DiscordClientService,
    private readonly config: DiscordBotConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly scope: RandomInsightsScopeService,
  ) {}

  onApplicationBootstrap(): void {
    const cronTime = this.config.getRandomInsightsCron();
    // Force the channel id and the two percent-probability getters to be
    // read (and thus validated) here too, even though they're only actually
    // used later inside postRandomInsight()'s try/catch. That try/catch
    // swallows and logs errors so transient per-tick failures don't kill the
    // schedule -- but that would also silently swallow a missing or invalid
    // env var forever instead of failing startup, so validate eagerly.
    this.config.getRandomInsightsDiscordChannel();
    this.scope.validateConfig();
    const job: CronJob<null, null> = CronJob.from({
      cronTime,
      onTick: () => {
        void this.postRandomInsight();
      },
    });
    this.registry.addCronJob(RANDOM_INSIGHTS_JOB_NAME, job);
    job.start();
    this.logger.log(`Scheduled random insights with cron "${cronTime}"`);
  }

  /**
   * One tick: resolve an insight and post it. Every failure is logged and
   * swallowed -- a transient Discord or database error must not kill the
   * process or stop the schedule.
   */
  async postRandomInsight(): Promise<void> {
    try {
      const channelId = this.config.getRandomInsightsDiscordChannel();
      const scope = await this.scope.pickScope();
      const message = await this.insightsCommand.resolveRandomFact(scope);
      await this.discordClient.sendMessage(channelId, message);
      this.logger.log(`Posted random insight to channel ${channelId}`);
    } catch (error) {
      this.logger.error(
        'Failed to post scheduled random insight',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
