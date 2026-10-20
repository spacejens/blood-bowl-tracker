import { Logger } from '@nestjs/common';
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
import type { HandledInteraction, InteractionHandledListener } from './index';
import {
  DISCORD_BOT_TOKEN,
  DiscordClientService,
  MemberRoleAccessService,
} from './index';

const OCCURRED_AT = new Date('2026-09-09T12:00:00.000Z');

/**
 * The dispatcher's side of the interaction-handled hook: when listeners are
 * told, with what, and that a failing listener never reaches the user.
 * `HandledInteractionBuilderService` is pure and dependency-free, so it is
 * passed real; its extraction details are covered in its own spec.
 */
describe('DiscordClientService interaction-handled listeners', () => {
  let service: DiscordClientService;
  let listener: Mock<InteractionHandledListener>;
  let discord: DiscordJsMocks;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  function interactionHandler(): (interaction: unknown) => void {
    const call = discord.client.on.mock.calls.find(
      ([event]) => event === 'interactionCreate',
    );
    if (!call) throw new Error('interactionCreate handler not registered');
    return call[1] as (interaction: unknown) => void;
  }

  function commandInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      createdAt: OCCURRED_AT,
      user: { tag: 'spacejens#0001', id: 'u1', username: 'spacejens' },
      guildId: 'g1',
      guild: { name: 'The Pitch' },
      member: { nickname: 'Skitter' },
      channelId: 'c1',
      channel: { name: 'general' },
      options: { data: [] },
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function buttonInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:42',
      createdAt: OCCURRED_AT,
      user: { tag: 'spacejens#0001', id: 'u1', username: 'spacejens' },
      guildId: 'g1',
      guild: { name: 'The Pitch' },
      member: { nickname: 'Skitter' },
      channelId: 'c1',
      channel: { name: 'general' },
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function selectMenuInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      ...buttonInteraction(),
      isButton: () => false,
      isStringSelectMenu: () => true,
      customId: 'deepdive:era:menu:0',
      values: ['7', '9'],
      ...overrides,
    };
  }

  /** The event the listener received on its first call. */
  function notified(): HandledInteraction {
    const call = listener.mock.calls.at(0);
    if (!call) throw new Error('listener was not called');
    return call[0];
  }

  async function registerStats(
    execute = vi.fn().mockResolvedValue('the answer'),
  ): Promise<void> {
    await service.registerCommands([
      { name: 'stats', description: 'Show stats', execute },
    ]);
  }

  beforeEach(async () => {
    discord = installDiscordJsMocks();
    discord.client.destroy.mockResolvedValue(undefined);
    listener = vi.fn<InteractionHandledListener>().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        MemberRoleAccessService,
        HandledInteractionBuilderService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
      ],
    }).compile();
    service = moduleRef.get(DiscordClientService);
    service.onModuleInit();
    service.registerInteractionHandledListener(listener);
  });

  afterEach(() => {
    resetDiscordJsMocks();
    vi.restoreAllMocks();
  });

  it('notifies a successful command with its Discord context', async () => {
    await registerStats();

    interactionHandler()(commandInteraction());
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(notified()).toEqual({
      kind: 'command',
      name: 'stats',
      occurredAt: OCCURRED_AT,
      discordUserId: 'u1',
      username: 'spacejens',
      discordGuildId: 'g1',
      guildName: 'The Pitch',
      nickname: 'Skitter',
      discordChannelId: 'c1',
      channelName: 'general',
      outcome: 'success',
      errorMessage: undefined,
      parameters: [],
    });
  });

  it('notifies only after the user has been replied to', async () => {
    await registerStats();
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    const reply = interaction.reply as Mock;
    expect(reply.mock.invocationCallOrder[0]).toBeLessThan(
      listener.mock.invocationCallOrder[0],
    );
  });

  it('notifies one parameter per command option, stringifying non-strings', async () => {
    await registerStats();

    interactionHandler()(
      commandInteraction({
        options: {
          data: [
            { name: 'category', value: 'matches' },
            { name: 'limit', value: 5 },
            { name: 'missing', value: undefined },
          ],
        },
      }),
    );
    await flush();

    expect(notified().parameters).toEqual([
      { key: 'category', value: 'matches' },
      { key: 'limit', value: '5' },
      { key: 'missing', value: undefined },
    ]);
  });

  it('notifies a failure with the thrown error message and still replies', async () => {
    await registerStats(vi.fn().mockRejectedValue(new Error('boom')));
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(notified().outcome).toBe('failure');
    expect(notified().errorMessage).toBe('boom');
    expect(interaction.reply).toHaveBeenCalledWith('I am badly hurt');
  });

  it('notifies a failure with a non-Error rejection stringified', async () => {
    await registerStats(vi.fn().mockRejectedValue('plain string'));

    interactionHandler()(commandInteraction());
    await flush();

    expect(notified().errorMessage).toBe('plain string');
  });

  it('leaves guild fields unset for a DM', async () => {
    await registerStats();

    interactionHandler()(
      commandInteraction({
        guildId: null,
        guild: null,
        member: null,
        channel: null,
      }),
    );
    await flush();

    expect(notified().discordGuildId).toBeUndefined();
    expect(notified().guildName).toBeUndefined();
    expect(notified().nickname).toBeUndefined();
    expect(notified().channelName).toBeUndefined();
  });

  it('does not notify an interaction with no registered handler', async () => {
    interactionHandler()(commandInteraction({ commandName: 'unknown' }));
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });

  it('replies normally and logs a warning when a listener rejects', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const failure = new Error('db down');
    listener.mockRejectedValue(failure);
    await registerStats();
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledWith('the answer');
    expect(warn).toHaveBeenCalledWith(
      'Interaction-handled listener failed',
      failure,
    );
  });

  it('replies normally and logs a warning when a listener throws synchronously', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    listener.mockImplementation(() => {
      throw new Error('sync boom');
    });
    await registerStats();
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
    expect(warn).toHaveBeenCalledWith(
      'Interaction-handled listener failed',
      expect.objectContaining({ message: 'sync boom' }),
    );
  });

  it('notifies every listener in registration order, even after one rejects', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const second = vi
      .fn<InteractionHandledListener>()
      .mockResolvedValue(undefined);
    listener.mockRejectedValue(new Error('first fails'));
    service.registerInteractionHandledListener(second);
    await registerStats();

    interactionHandler()(commandInteraction());
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(listener.mock.invocationCallOrder[0]).toBeLessThan(
      second.mock.invocationCallOrder[0],
    );
    expect(second.mock.calls[0][0]).toEqual(notified());
  });

  it('notifies a button under its matched prefix, with the customId remainder', async () => {
    service.registerButtonHandler(
      'deepdive:era:',
      vi.fn().mockResolvedValue('ok'),
    );

    interactionHandler()(buttonInteraction());
    await flush();

    expect(notified().kind).toBe('button');
    expect(notified().name).toBe('deepdive:era:');
    expect(notified().parameters).toEqual([{ key: 'id', value: '42' }]);
    expect(notified().outcome).toBe('success');
  });

  it('notifies a button failure with the thrown error message', async () => {
    service.registerButtonHandler(
      'deepdive:era:',
      vi.fn().mockRejectedValue(new Error('button boom')),
    );

    interactionHandler()(buttonInteraction());
    await flush();

    expect(notified().outcome).toBe('failure');
    expect(notified().errorMessage).toBe('button boom');
  });

  it('notifies a select menu with its remainder and one parameter per selected value', async () => {
    service.registerSelectMenuHandler(
      'deepdive:era:',
      vi.fn().mockResolvedValue('ok'),
    );

    interactionHandler()(selectMenuInteraction());
    await flush();

    expect(notified().kind).toBe('select_menu');
    expect(notified().name).toBe('deepdive:era:');
    expect(notified().parameters).toEqual([
      { key: 'id', value: 'menu:0' },
      { key: 'value', value: '7' },
      { key: 'value', value: '9' },
    ]);
  });

  it('does not notify a component with no matching prefix', async () => {
    service.registerButtonHandler(
      'deepdive:era:',
      vi.fn().mockResolvedValue('ok'),
    );

    interactionHandler()(buttonInteraction({ customId: 'other:1' }));
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });
});
