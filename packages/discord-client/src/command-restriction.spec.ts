import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord.js', async () =>
  (await import('./discord-js-mock.test-helpers.js')).discordJsModuleMock(),
);

import type { DiscordJsMocks } from './discord-js-mock.test-helpers';
import {
  installDiscordJsMocks,
  resetDiscordJsMocks,
} from './discord-js-mock.test-helpers';
import { HandledInteractionBuilderService } from './handled-interaction-builder.service';
import type { InteractionHandledListener } from './index';
import {
  ADMIN_COMMAND_ROLE_ID,
  DEBUG_COMMAND_ROLE_ID,
  DISCORD_BOT_TOKEN,
  DiscordClientService,
  MemberRoleAccessService,
} from './index';

const ROLE_ID = 'role-1';
const ADMIN_ROLE_ID = 'admin-role-1';
const OCCURRED_AT = new Date('2026-09-13T12:00:00.000Z');
const DENIAL_REPLY = {
  content: "You don't have permission to use this command.",
  flags: 64,
};

describe('DiscordClientService restricted commands', () => {
  let listener: Mock<InteractionHandledListener>;
  let discord: DiscordJsMocks;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  /**
   * The subject, built with specific configured role ids — which have to
   * exist before construction, so this is a per-test factory rather than one
   * subject built in `beforeEach`.
   */
  async function makeService(
    roles: { debug?: string; admin?: string } = {},
  ): Promise<DiscordClientService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        MemberRoleAccessService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
        { provide: DEBUG_COMMAND_ROLE_ID, useValue: roles.debug },
        { provide: ADMIN_COMMAND_ROLE_ID, useValue: roles.admin },
        HandledInteractionBuilderService,
      ],
    }).compile();
    const service = moduleRef.get(DiscordClientService);
    service.onModuleInit();
    service.registerInteractionHandledListener(listener);
    return service;
  }

  function interactionHandler(): (interaction: unknown) => void {
    const call = discord.client.on.mock.calls.find(
      ([event]) => event === 'interactionCreate',
    );
    if (!call) throw new Error('interactionCreate handler not registered');
    return call[1] as (interaction: unknown) => void;
  }

  /** A `/debugstuff` invocation, by default by a member without the role. */
  function commandInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'debugstuff',
      createdAt: OCCURRED_AT,
      user: { tag: 'spacejens#0001', id: 'u1', username: 'spacejens' },
      guildId: 'g1',
      guild: { name: 'The Pitch' },
      member: { roles: ['other'] },
      channelId: 'c1',
      channel: { name: 'general' },
      options: { data: [] },
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    discord = installDiscordJsMocks();
    discord.client.destroy.mockResolvedValue(undefined);
    discord.client.application.commands.set.mockResolvedValue(undefined);
    listener = vi.fn<InteractionHandledListener>().mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetDiscordJsMocks();
  });

  it('runs a restricted command for a member holding the role', async () => {
    const service = await makeService({ debug: ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute,
      },
    ]);
    const interaction = commandInteraction({ member: { roles: [ROLE_ID] } });

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('refuses a restricted command for a member without the role', async () => {
    const service = await makeService({ debug: ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute,
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(DENIAL_REPLY);
  });

  it('notifies listeners of a refused attempt as a failure', async () => {
    const service = await makeService({ debug: ROLE_ID });
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute: vi.fn(),
      },
    ]);

    interactionHandler()(commandInteraction());
    await flush();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'command',
        name: 'debugstuff',
        discordUserId: 'u1',
        outcome: 'failure',
        errorMessage: 'Missing required role',
      }),
    );
  });

  it('refuses a restricted command invoked in a direct message', async () => {
    const service = await makeService({ debug: ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute,
      },
    ]);
    const interaction = commandInteraction({
      member: null,
      guildId: null,
      guild: null,
    });

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(DENIAL_REPLY);
  });

  it('runs a restricted command when no role is configured', async () => {
    const service = await makeService();
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute,
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('leaves an unrestricted command open even when a role is configured', async () => {
    const service = await makeService({ debug: ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'debugstuff', description: 'Open', execute },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('runs an admin command for a member holding the admin role', async () => {
    const service = await makeService({ debug: ROLE_ID, admin: ADMIN_ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'adminstuff',
        description: 'Admin: stuff',
        restrictedRole: 'admin',
        execute,
      },
    ]);
    const interaction = commandInteraction({
      commandName: 'adminstuff',
      member: { roles: [ADMIN_ROLE_ID] },
    });

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('refuses an admin command for a member holding only the debug role', async () => {
    const service = await makeService({ debug: ROLE_ID, admin: ADMIN_ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'adminstuff',
        description: 'Admin: stuff',
        restrictedRole: 'admin',
        execute,
      },
    ]);
    const interaction = commandInteraction({
      commandName: 'adminstuff',
      member: { roles: [ROLE_ID] },
    });

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(DENIAL_REPLY);
  });

  it('refuses a debug command for a member holding only the admin role', async () => {
    const service = await makeService({ debug: ROLE_ID, admin: ADMIN_ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute,
      },
    ]);
    const interaction = commandInteraction({
      member: { roles: [ADMIN_ROLE_ID] },
    });

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(DENIAL_REPLY);
  });

  it('runs an admin command when no admin role is configured, even with a debug role configured', async () => {
    const service = await makeService({ debug: ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'adminstuff',
        description: 'Admin: stuff',
        restrictedRole: 'admin',
        execute,
      },
    ]);
    const interaction = commandInteraction({ commandName: 'adminstuff' });

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
  });

  it('runs a debug command when no debug role is configured, even with an admin role configured', async () => {
    const service = await makeService({ admin: ADMIN_ROLE_ID });
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute,
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
  });

  describe('requiredRoleId', () => {
    const definition = (restrictedRole?: 'debug' | 'admin') => ({
      name: 'x',
      description: 'x',
      restrictedRole,
      execute: vi.fn(),
    });

    it('names the debug role for a debug-restricted command', async () => {
      const service = await makeService({
        debug: ROLE_ID,
        admin: ADMIN_ROLE_ID,
      });
      expect(service.requiredRoleId(definition('debug'))).toBe(ROLE_ID);
    });

    it('names the admin role for an admin-restricted command', async () => {
      const service = await makeService({
        debug: ROLE_ID,
        admin: ADMIN_ROLE_ID,
      });
      expect(service.requiredRoleId(definition('admin'))).toBe(ADMIN_ROLE_ID);
    });

    it('requires no role for an unrestricted command', async () => {
      const service = await makeService({
        debug: ROLE_ID,
        admin: ADMIN_ROLE_ID,
      });
      expect(service.requiredRoleId(definition())).toBeUndefined();
    });

    it('requires no role when the command role kind has none configured', async () => {
      const service = await makeService({ debug: ROLE_ID });
      expect(service.requiredRoleId(definition('admin'))).toBeUndefined();
    });
  });
});
