import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { RandomInsightsSchedulerService } from '../insights/random-insights-scheduler.service';
import { SlashCommandRegistryService } from '../slash-commands/slash-command-registry.service';
import { StartupNotifierService } from '../startup-notifier.service';
import { AdvisoryLockService } from './advisory-lock.service';
import {
  LeaderElectionService,
  LOCK_HEALTH_CHECK_INTERVAL_MS,
  LOCK_RETRY_INTERVAL_MS,
} from './leader-election.service';
import { ProcessExitService } from './process-exit.service';
import { SleepService } from './sleep.service';

describe('LeaderElectionService', () => {
  let lock: MockProxy<AdvisoryLockService>;
  let discordClient: MockProxy<DiscordClientService>;
  let commandRegistry: MockProxy<SlashCommandRegistryService>;
  let scheduler: MockProxy<RandomInsightsSchedulerService>;
  let startupNotifier: MockProxy<StartupNotifierService>;
  let sleep: MockProxy<SleepService>;
  let processExit: MockProxy<ProcessExitService>;
  let service: LeaderElectionService;

  beforeEach(async () => {
    lock = mock<AdvisoryLockService>();
    lock.tryAcquire.mockResolvedValue(true);
    lock.isStillHeld.mockResolvedValue(true);
    lock.release.mockResolvedValue(undefined);
    discordClient = mock<DiscordClientService>();
    discordClient.connect.mockResolvedValue(undefined);
    commandRegistry = mock<SlashCommandRegistryService>();
    commandRegistry.flush.mockResolvedValue(undefined);
    scheduler = mock<RandomInsightsSchedulerService>();
    startupNotifier = mock<StartupNotifierService>();
    startupNotifier.postActiveStartupMessage.mockResolvedValue(undefined);
    startupNotifier.postStandbyStartupMessage.mockResolvedValue(undefined);
    sleep = mock<SleepService>();
    // monitorLock is an intentional infinite loop, so an always-resolving
    // sleep would spin it forever inside a test. Only the retry sleep
    // resolves by default; the monitorLock test opts back in.
    sleep.sleep.mockImplementation((ms: number) =>
      ms === LOCK_RETRY_INTERVAL_MS
        ? Promise.resolve()
        : new Promise<void>(() => undefined),
    );
    processExit = mock<ProcessExitService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaderElectionService,
        { provide: AdvisoryLockService, useValue: lock },
        { provide: DiscordClientService, useValue: discordClient },
        { provide: SlashCommandRegistryService, useValue: commandRegistry },
        { provide: RandomInsightsSchedulerService, useValue: scheduler },
        { provide: StartupNotifierService, useValue: startupNotifier },
        { provide: SleepService, useValue: sleep },
        { provide: ProcessExitService, useValue: processExit },
      ],
    }).compile();
    service = moduleRef.get(LeaderElectionService);
  });

  it('runs the became-active sequence in order once the lock is acquired', async () => {
    const order: string[] = [];
    discordClient.connect.mockImplementation(() => {
      order.push('connect');
      return Promise.resolve();
    });
    commandRegistry.flush.mockImplementation(() => {
      order.push('flush');
      return Promise.resolve();
    });
    scheduler.start.mockImplementation(() => {
      order.push('cron');
    });
    startupNotifier.postActiveStartupMessage.mockImplementation(() => {
      order.push('announce');
      return Promise.resolve();
    });

    await service.run();

    expect(order).toEqual(['connect', 'flush', 'cron', 'announce']);
    expect(startupNotifier.postStandbyStartupMessage).not.toHaveBeenCalled();
  });

  it('announces standby once and retries after the interval', async () => {
    lock.tryAcquire.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await service.run();

    expect(lock.tryAcquire).toHaveBeenCalledTimes(3);
    expect(startupNotifier.postStandbyStartupMessage).toHaveBeenCalledTimes(1);
    expect(sleep.sleep).toHaveBeenCalledWith(LOCK_RETRY_INTERVAL_MS);
    // Counted by interval rather than in total: once active, run() also kicks
    // off monitorLock, whose first health-check sleep lands before it returns.
    expect(
      sleep.sleep.mock.calls.filter(([ms]) => ms === LOCK_RETRY_INTERVAL_MS),
    ).toHaveLength(2);
  });

  it('does not touch Discord while it is standby', async () => {
    lock.tryAcquire.mockResolvedValueOnce(false);

    await service.run();

    // Exactly one connect: the successful second attempt, never the standby one.
    expect(discordClient.connect).toHaveBeenCalledTimes(1);
    expect(scheduler.start).toHaveBeenCalledTimes(1);
  });

  it('releases the lock and retries when Discord login fails', async () => {
    discordClient.connect
      .mockRejectedValueOnce(new Error('Invalid token'))
      .mockResolvedValueOnce(undefined);

    await service.run();

    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(lock.tryAcquire).toHaveBeenCalledTimes(2);
    expect(startupNotifier.postActiveStartupMessage).toHaveBeenCalledTimes(1);
    expect(processExit.exit).not.toHaveBeenCalled();
  });

  it('releases the lock and retries when the active announcement fails', async () => {
    startupNotifier.postActiveStartupMessage
      .mockRejectedValueOnce(new Error('channel not found'))
      .mockResolvedValueOnce(undefined);

    await service.run();

    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(lock.tryAcquire).toHaveBeenCalledTimes(2);
  });

  it('exits fatally when the lock is lost while active', async () => {
    sleep.sleep.mockResolvedValue(undefined);
    lock.isStillHeld.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.monitorLock();

    expect(sleep.sleep).toHaveBeenCalledWith(LOCK_HEALTH_CHECK_INTERVAL_MS);
    expect(processExit.exit).toHaveBeenCalledWith(1);
  });

  it('starts the election loop from bootstrap without blocking it', async () => {
    let resolveAcquire: (value: boolean) => void = () => undefined;
    lock.tryAcquire.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveAcquire = resolve;
      }),
    );

    expect(service.onApplicationBootstrap()).toBeUndefined();
    expect(discordClient.connect).not.toHaveBeenCalled();

    resolveAcquire(true);
    await Promise.resolve();
  });
});
