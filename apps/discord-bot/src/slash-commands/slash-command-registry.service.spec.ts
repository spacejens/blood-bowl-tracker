import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { describe, expect, it, vi } from 'vitest';

import { SlashCommandRegistryService } from './slash-command-registry.service';

function makeRegistry() {
  const discordClient = {
    registerCommands: vi.fn().mockResolvedValue(undefined),
  };
  const registry = new SlashCommandRegistryService(
    discordClient as unknown as DiscordClientService,
  );
  return { registry, discordClient };
}

describe('SlashCommandRegistryService', () => {
  it('registers all accumulated commands in a single registerCommands call', async () => {
    const { registry, discordClient } = makeRegistry();
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
    const { registry, discordClient } = makeRegistry();
    await registry.onApplicationBootstrap();
    expect(discordClient.registerCommands).toHaveBeenCalledWith([]);
  });
});
