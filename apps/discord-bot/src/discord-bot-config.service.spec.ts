import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DiscordBotConfigService } from './discord-bot-config.service';

describe('DiscordBotConfigService', () => {
  let service: DiscordBotConfigService;
  let configService: MockProxy<ConfigService>;

  beforeEach(async () => {
    configService = mock<ConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordBotConfigService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(DiscordBotConfigService);
  });

  it('returns the configured database URL', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'DATABASE_URL' ? 'postgres://x' : undefined,
    );
    expect(service.getDatabaseUrl()).toBe('postgres://x');
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('throws when the database URL is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getDatabaseUrl()).toThrow(
      'DATABASE_URL is not configured',
    );
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('returns the configured Discord bot token', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'DISCORD_BOT_TOKEN' ? 'tkn' : undefined,
    );
    expect(service.getDiscordBotToken()).toBe('tkn');
    expect(configService.get).toHaveBeenCalledWith('DISCORD_BOT_TOKEN');
  });

  it('throws when the Discord bot token is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getDiscordBotToken()).toThrow(
      'DISCORD_BOT_TOKEN is not configured',
    );
    expect(configService.get).toHaveBeenCalledWith('DISCORD_BOT_TOKEN');
  });

  it('returns the configured startup message channel', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'STARTUP_MESSAGE_DISCORD_CHANNEL' ? '42' : undefined,
    );
    expect(service.getStartupMessageDiscordChannel()).toBe('42');
    expect(configService.get).toHaveBeenCalledWith(
      'STARTUP_MESSAGE_DISCORD_CHANNEL',
    );
  });

  it('throws when the startup message channel is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getStartupMessageDiscordChannel()).toThrow(
      'STARTUP_MESSAGE_DISCORD_CHANNEL is not configured',
    );
  });

  it('returns the configured random insights cron expression', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'RANDOM_INSIGHTS_CRON' ? '0 * * * *' : undefined,
    );
    expect(service.getRandomInsightsCron()).toBe('0 * * * *');
    expect(configService.get).toHaveBeenCalledWith('RANDOM_INSIGHTS_CRON');
  });

  it('throws when the random insights cron expression is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getRandomInsightsCron()).toThrow(
      'RANDOM_INSIGHTS_CRON is not configured',
    );
  });

  it('returns the configured random insights channel', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'RANDOM_INSIGHTS_DISCORD_CHANNEL' ? '99' : undefined,
    );
    expect(service.getRandomInsightsDiscordChannel()).toBe('99');
    expect(configService.get).toHaveBeenCalledWith(
      'RANDOM_INSIGHTS_DISCORD_CHANNEL',
    );
  });

  it('throws when the random insights channel is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getRandomInsightsDiscordChannel()).toThrow(
      'RANDOM_INSIGHTS_DISCORD_CHANNEL is not configured',
    );
  });

  it('returns the filter probability as a number', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'RANDOM_INSIGHTS_FILTER_PROBABILITY' ? '50' : undefined,
    );
    expect(service.getRandomInsightsFilterProbability()).toBe(50);
    expect(configService.get).toHaveBeenCalledWith(
      'RANDOM_INSIGHTS_FILTER_PROBABILITY',
    );
  });

  it('accepts 0 and 100 as filter probabilities', () => {
    configService.get.mockReturnValue('0');
    expect(service.getRandomInsightsFilterProbability()).toBe(0);
    configService.get.mockReturnValue('100');
    expect(service.getRandomInsightsFilterProbability()).toBe(100);
  });

  it('throws when the filter probability is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getRandomInsightsFilterProbability()).toThrow(
      'RANDOM_INSIGHTS_FILTER_PROBABILITY is not configured',
    );
  });

  it('throws when the filter probability is not an integer', () => {
    configService.get.mockReturnValue('half');
    expect(() => service.getRandomInsightsFilterProbability()).toThrow(
      'RANDOM_INSIGHTS_FILTER_PROBABILITY must be an integer between 0 and 100',
    );
    configService.get.mockReturnValue('12.5');
    expect(() => service.getRandomInsightsFilterProbability()).toThrow(
      'RANDOM_INSIGHTS_FILTER_PROBABILITY must be an integer between 0 and 100',
    );
  });

  it('throws when the filter probability is out of range', () => {
    configService.get.mockReturnValue('101');
    expect(() => service.getRandomInsightsFilterProbability()).toThrow(
      'RANDOM_INSIGHTS_FILTER_PROBABILITY must be an integer between 0 and 100',
    );
    configService.get.mockReturnValue('-1');
    expect(() => service.getRandomInsightsFilterProbability()).toThrow(
      'RANDOM_INSIGHTS_FILTER_PROBABILITY must be an integer between 0 and 100',
    );
  });

  it('returns the current-era filter probability as a number', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'RANDOM_INSIGHTS_FILTER_CURRENT_ERA_PROBABILITY'
        ? '75'
        : undefined,
    );
    expect(service.getRandomInsightsFilterCurrentEraProbability()).toBe(75);
    expect(configService.get).toHaveBeenCalledWith(
      'RANDOM_INSIGHTS_FILTER_CURRENT_ERA_PROBABILITY',
    );
  });

  it('throws when the current-era filter probability is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() =>
      service.getRandomInsightsFilterCurrentEraProbability(),
    ).toThrow(
      'RANDOM_INSIGHTS_FILTER_CURRENT_ERA_PROBABILITY is not configured',
    );
  });

  it('throws when the current-era filter probability is out of range', () => {
    configService.get.mockReturnValue('200');
    expect(() =>
      service.getRandomInsightsFilterCurrentEraProbability(),
    ).toThrow(
      'RANDOM_INSIGHTS_FILTER_CURRENT_ERA_PROBABILITY must be an integer between 0 and 100',
    );
  });

  it('returns the configured port as a number', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'PORT' ? '4000' : undefined,
    );
    expect(service.getPort()).toBe(4000);
    expect(configService.get).toHaveBeenCalledWith('PORT');
  });

  it('defaults to port 3000 when not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(service.getPort()).toBe(3000);
    expect(configService.get).toHaveBeenCalledWith('PORT');
  });
});
