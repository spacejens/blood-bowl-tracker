import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { CronJob } from 'cron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { InsightsCommandService } from '../slash-commands/insights-command.service';
import {
  RANDOM_INSIGHTS_JOB_NAME,
  RandomInsightsSchedulerService,
} from './random-insights-scheduler.service';

describe('RandomInsightsSchedulerService', () => {
  let insightsCommand: MockProxy<InsightsCommandService>;
  let discordClient: MockProxy<DiscordClientService>;
  let config: MockProxy<DiscordBotConfigService>;
  let registry: MockProxy<SchedulerRegistry>;
  let service: RandomInsightsSchedulerService;

  beforeEach(async () => {
    insightsCommand = mock<InsightsCommandService>();
    insightsCommand.resolveRandomFact.mockResolvedValue('a random fact');
    discordClient = mock<DiscordClientService>();
    discordClient.sendMessage.mockResolvedValue(undefined);
    config = mock<DiscordBotConfigService>();
    config.getRandomInsightsCron.mockReturnValue('0 * * * *');
    config.getRandomInsightsDiscordChannel.mockReturnValue('99');
    registry = mock<SchedulerRegistry>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RandomInsightsSchedulerService,
        { provide: InsightsCommandService, useValue: insightsCommand },
        { provide: DiscordClientService, useValue: discordClient },
        { provide: DiscordBotConfigService, useValue: config },
        { provide: SchedulerRegistry, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(RandomInsightsSchedulerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The job handed to the mocked registry by onApplicationBootstrap. */
  function registeredJob(): CronJob {
    return registry.addCronJob.mock.calls[0][1];
  }

  it('registers and starts a cron job built from the configured expression', () => {
    service.onApplicationBootstrap();

    expect(registry.addCronJob).toHaveBeenCalledTimes(1);
    expect(registry.addCronJob.mock.calls[0][0]).toBe(RANDOM_INSIGHTS_JOB_NAME);
    const job = registeredJob();
    expect(job.isActive).toBe(true);
    expect(job.cronTime.source).toBe('0 * * * *');
    void job.stop();
  });

  it('posts an insight when the job ticks', async () => {
    service.onApplicationBootstrap();
    const job = registeredJob();
    void job.stop();

    await job.fireOnTick();

    expect(insightsCommand.resolveRandomFact).toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(
      '99',
      'a random fact',
    );
  });

  it('throws at bootstrap when the cron expression is invalid', () => {
    config.getRandomInsightsCron.mockReturnValue('not a cron expression');
    expect(() => service.onApplicationBootstrap()).toThrow();
    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('posts the resolved insight to the configured channel', async () => {
    const embed = {
      embeds: [{ title: 'Coaches', description: '1. Roze — 9' }],
    };
    insightsCommand.resolveRandomFact.mockResolvedValue(embed);

    await service.postRandomInsight();

    expect(discordClient.sendMessage).toHaveBeenCalledWith('99', embed);
  });

  it('swallows and logs a failure to post, so later ticks still run', async () => {
    const logged = vi
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
    discordClient.sendMessage.mockRejectedValue(new Error('Discord is down'));

    await expect(service.postRandomInsight()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
  });

  it('swallows a failure to resolve the insight', async () => {
    insightsCommand.resolveRandomFact.mockRejectedValue(new Error('db gone'));
    await expect(service.postRandomInsight()).resolves.toBeUndefined();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
  });
});
