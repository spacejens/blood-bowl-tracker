import type {
  DiscordClientService,
  SlashCommandDefinition,
} from '@blood-bowl-tracker/discord-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StatsSummaryService } from '../insights/stats-summary.service';
import { StatsCommandService } from './stats-command.service';

describe('StatsCommandService', () => {
  let discordClient: { registerCommands: ReturnType<typeof vi.fn> };
  let statsSummary: { buildSummaryMessage: ReturnType<typeof vi.fn> };
  let service: StatsCommandService;

  beforeEach(() => {
    discordClient = { registerCommands: vi.fn().mockResolvedValue(undefined) };
    statsSummary = {
      buildSummaryMessage: vi.fn().mockResolvedValue('the summary'),
    };
    service = new StatsCommandService(
      discordClient as unknown as DiscordClientService,
      statsSummary as unknown as StatsSummaryService,
    );
  });

  it('registers a stats command on bootstrap', async () => {
    await service.onApplicationBootstrap();
    expect(discordClient.registerCommands).toHaveBeenCalledTimes(1);
    const commands = discordClient.registerCommands.mock
      .calls[0][0] as SlashCommandDefinition[];
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('stats');
    expect(commands[0].description).toEqual(expect.any(String));
  });

  it('registers a command that returns the stats summary', async () => {
    await service.onApplicationBootstrap();
    const commands = discordClient.registerCommands.mock
      .calls[0][0] as SlashCommandDefinition[];
    const result = await commands[0].execute();
    expect(result).toBe('the summary');
    expect(statsSummary.buildSummaryMessage).toHaveBeenCalled();
  });
});
