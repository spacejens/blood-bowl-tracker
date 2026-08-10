import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { RandomInsightsSchedulerService } from '../insights/random-insights-scheduler.service';
import { SlashCommandRegistryService } from '../slash-commands/slash-command-registry.service';
import { StartupNotifierService } from '../startup-notifier.service';
import { AdvisoryLockService } from './advisory-lock.service';
import { ProcessExitService } from './process-exit.service';
import { SleepService } from './sleep.service';

/** How long a standby waits between attempts to take the lock. */
export const LOCK_RETRY_INTERVAL_MS = 15_000;

/** How often an active machine re-checks that it still holds the lock. */
export const LOCK_HEALTH_CHECK_INTERVAL_MS = 30_000;

/**
 * Decides which of the app's machines owns the Discord gateway session.
 *
 * Both machines run identical code; the one that wins a Postgres advisory lock
 * becomes active and does everything Discord-facing, and the other waits.
 * Discord delivers every gateway event to every connected session of an
 * unsharded bot, so two live sessions would race to answer the same slash
 * command and would post duplicate scheduled insights.
 */
@Injectable()
export class LeaderElectionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeaderElectionService.name);
  private standbyAnnounced = false;

  constructor(
    private readonly lock: AdvisoryLockService,
    private readonly discordClient: DiscordClientService,
    private readonly commandRegistry: SlashCommandRegistryService,
    private readonly scheduler: RandomInsightsSchedulerService,
    private readonly startupNotifier: StartupNotifierService,
    private readonly sleep: SleepService,
    private readonly processExit: ProcessExitService,
  ) {}

  /**
   * Deliberately does NOT await `run()`: Nest finishes bootstrapping and
   * `main.ts` calls `app.listen()` immediately, so the TCP health check and
   * the import-tool RPC endpoint are live on both machines regardless of
   * leadership.
   */
  onApplicationBootstrap(): void {
    void this.run().catch((error: unknown) => {
      this.logger.error('Leader election loop failed', error);
    });
  }

  /** Retries until this machine is active, then starts the health monitor. */
  async run(): Promise<void> {
    for (;;) {
      if (await this.lock.tryAcquire()) {
        this.logger.log('Acquired the leader lock; becoming active');
        if (await this.becomeActive()) {
          void this.monitorLock();
          return;
        }
      } else {
        this.announceStandby();
      }
      await this.sleep.sleep(LOCK_RETRY_INTERVAL_MS);
    }
  }

  /**
   * Watches the lock for as long as this machine is active. Losing it is
   * fatal: this process can no longer prove it is the only leader, and
   * reconciling that ambiguity is more failure-prone than letting Fly restart
   * the machine so it rejoins the election cleanly.
   */
  async monitorLock(): Promise<void> {
    for (;;) {
      await this.sleep.sleep(LOCK_HEALTH_CHECK_INTERVAL_MS);
      if (!(await this.lock.isStillHeld())) {
        this.logger.error('Lost the leader lock while active; exiting');
        this.processExit.exit(1);
        return;
      }
    }
  }

  /**
   * The became-active sequence. A failure anywhere here releases the lock so a
   * standby can take over, and this machine re-enters the election instead of
   * crashing — which is possible only because Discord login is no longer a
   * Nest lifecycle hook.
   */
  private async becomeActive(): Promise<boolean> {
    try {
      await this.discordClient.connect();
      await this.commandRegistry.flush();
      this.scheduler.start();
      await this.startupNotifier.postActiveStartupMessage();
      this.logger.log('Now active');
      return true;
    } catch (error) {
      this.logger.error(
        'Failed to become active; releasing the lock and retrying',
        error instanceof Error ? error.stack : String(error),
      );
      await this.lock.release();
      return false;
    }
  }

  /** Posted once per process, not once per retry. */
  private announceStandby(): void {
    if (this.standbyAnnounced) {
      return;
    }
    this.standbyAnnounced = true;
    this.logger.log('Another machine holds the leader lock; standing by');
    void this.startupNotifier.postStandbyStartupMessage();
  }
}
