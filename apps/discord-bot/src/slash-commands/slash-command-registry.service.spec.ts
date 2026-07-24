import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { SlashCommandRegistryService } from './slash-command-registry.service';

describe('SlashCommandRegistryService', () => {
  let registry: SlashCommandRegistryService;
  let discordClient: MockProxy<DiscordClientService>;

  beforeEach(async () => {
    discordClient = mock<DiscordClientService>();
    discordClient.registerCommands.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        SlashCommandRegistryService,
        { provide: DiscordClientService, useValue: discordClient },
      ],
    }).compile();
    registry = moduleRef.get(SlashCommandRegistryService);
  });

  it('registers all accumulated commands in a single registerCommands call', async () => {
    registry.register({
      name: 'insights',
      description: 'a',
      execute: vi.fn(),
    });
    registry.register({
      name: 'deepdive',
      description: 'b',
      execute: vi.fn(),
    });
    await registry.onApplicationBootstrap();
    expect(discordClient.registerCommands).toHaveBeenCalledTimes(1);
    const commands = discordClient.registerCommands.mock.calls[0][0] as {
      name: string;
    }[];
    expect(commands.map((c) => c.name)).toEqual(['insights', 'deepdive']);
  });

  it('calls registerCommands with an empty list when nothing registered', async () => {
    await registry.onApplicationBootstrap();
    expect(discordClient.registerCommands).toHaveBeenCalledWith([]);
  });
});
