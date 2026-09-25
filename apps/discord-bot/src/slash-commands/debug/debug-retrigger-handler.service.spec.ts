import type { InteractionEventRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import {
  DiscordClientService,
  MemberRoleAccessService,
} from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import {
  DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE,
  DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
  DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE,
} from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { DEBUG_RETRIGGER_CUSTOM_ID_PREFIX } from './debug-custom-ids';
import { DebugRetriggerHandlerService } from './debug-retrigger-handler.service';

function eventRow(
  overrides: Partial<InteractionEventRow>,
): InteractionEventRow {
  return {
    id: 11,
    occurredAt: new Date('2026-09-09T12:00:00.000Z'),
    kind: 'command',
    name: 'insights',
    outcome: 'success',
    errorMessage: null,
    username: 'coach42',
    guildName: 'Test League',
    channelName: 'general',
    parameters: [],
    ...overrides,
  };
}

/** A click on the retrigger button for `eventId`, by a given member (if any). */
function click(
  eventId: string,
  member?: ButtonInteraction['member'],
): ButtonInteraction {
  return {
    customId: `${DEBUG_RETRIGGER_CUSTOM_ID_PREFIX}${eventId}`,
    member: member ?? null,
  } as ButtonInteraction;
}

/**
 * Builds a freshly-compiled `DebugRetriggerHandlerService` whose
 * `DiscordClientService` mock reports `requiredRoleId` as the given id for
 * every command. Used by the tests that exercise the role check; tests
 * unconcerned with restriction use the `beforeEach` subject, whose client
 * reports no required role.
 */
async function makeService(requiredRoleId: string | undefined): Promise<{
  service: DebugRetriggerHandlerService;
  events: DeepMockProxy<InteractionEventsQueryService>;
  registry: DeepMockProxy<SlashCommandRegistryService>;
  discordClient: DeepMockProxy<DiscordClientService>;
  memberRoleAccess: MockProxy<MemberRoleAccessService>;
}> {
  const events = mockDeep<InteractionEventsQueryService>();
  const registry = mockDeep<SlashCommandRegistryService>();
  const discordClient = mockDeep<DiscordClientService>();
  discordClient.requiredRoleId.mockReturnValue(requiredRoleId);
  const memberRoleAccess = mock<MemberRoleAccessService>();

  const moduleRef = await Test.createTestingModule({
    providers: [
      DebugRetriggerHandlerService,
      { provide: InteractionEventsQueryService, useValue: events },
      { provide: SlashCommandRegistryService, useValue: registry },
      { provide: DiscordClientService, useValue: discordClient },
      { provide: MemberRoleAccessService, useValue: memberRoleAccess },
    ],
  }).compile();

  return {
    service: moduleRef.get(DebugRetriggerHandlerService),
    events,
    registry,
    discordClient,
    memberRoleAccess,
  };
}

describe('DebugRetriggerHandlerService', () => {
  let service: DebugRetriggerHandlerService;
  let events: DeepMockProxy<InteractionEventsQueryService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;
  let discordClient: DeepMockProxy<DiscordClientService>;

  beforeEach(async () => {
    events = mockDeep<InteractionEventsQueryService>();
    registry = mockDeep<SlashCommandRegistryService>();
    discordClient = mockDeep<DiscordClientService>();
    discordClient.requiredRoleId.mockReturnValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebugRetriggerHandlerService,
        { provide: InteractionEventsQueryService, useValue: events },
        { provide: SlashCommandRegistryService, useValue: registry },
        { provide: DiscordClientService, useValue: discordClient },
        {
          provide: MemberRoleAccessService,
          useValue: mock<MemberRoleAccessService>(),
        },
      ],
    }).compile();
    service = moduleRef.get(DebugRetriggerHandlerService);
  });

  it('registers itself on the retrigger prefix on module init', () => {
    service.onModuleInit();

    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      DEBUG_RETRIGGER_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
  });

  it('replies ephemerally when the event is no longer on record', async () => {
    events.findById.mockResolvedValue(undefined);

    expect(await service.handle(click('11'))).toEqual({
      content: DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(events.findById).toHaveBeenCalledWith(11);
  });

  it('replies ephemerally when the button id is not a number', async () => {
    expect(await service.handle(click('nope'))).toEqual({
      content: DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(events.findById).not.toHaveBeenCalled();
  });

  it('replies ephemerally when the button id is empty, without querying the database', async () => {
    expect(await service.handle(click(''))).toEqual({
      content: DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(events.findById).not.toHaveBeenCalled();
  });

  it('replies ephemerally when the button id is negative, without querying the database', async () => {
    expect(await service.handle(click('-5'))).toEqual({
      content: DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(events.findById).not.toHaveBeenCalled();
  });

  it('the registered handler delegates to handle', async () => {
    service.onModuleInit();
    events.findById.mockResolvedValue(undefined);

    const [, callback] = discordClient.registerButtonHandler.mock.calls[0];
    expect(await callback(click('11'))).toEqual({
      content: DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('re-runs a recorded command with its recorded options', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'command',
        name: 'insights',
        parameters: [
          { key: 'race', value: '17' },
          { key: 'category', value: 'kills' },
        ],
      }),
    );
    const execute = vi.fn().mockResolvedValue('the answer');
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute,
    });

    expect(await service.handle(click('11'))).toBe('the answer');
    expect(registry.findByName).toHaveBeenCalledWith('insights');
    const synthetic = execute.mock.calls[0][0] as {
      options: { getString: (name: string) => string | null };
    };
    expect(synthetic.options.getString('race')).toBe('17');
    expect(synthetic.options.getString('category')).toBe('kills');
    expect(synthetic.options.getString('missing')).toBeNull();
  });

  it('offers getUser on the synthetic command interaction, resolving a recorded user parameter', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'command',
        parameters: [{ key: 'user', value: '999888777' }],
      }),
    );
    const execute = vi.fn().mockResolvedValue('ok');
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute,
    });

    await service.handle(click('11'));

    const synthetic = execute.mock.calls[0][0] as {
      options: { getUser: (name: string) => { id: string } | null };
    };
    expect(synthetic.options.getUser('user')).toEqual({ id: '999888777' });
    expect(synthetic.options.getUser('missing')).toBeNull();
  });

  it('replies ephemerally when the command is no longer registered', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'gone' }),
    );
    registry.findByName.mockReturnValue(undefined);

    expect(await service.handle(click('11'))).toEqual({
      content: DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('re-runs a recorded button with its reconstructed customId', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'button',
        name: 'coach:',
        parameters: [{ key: 'id', value: '42' }],
      }),
    );
    const handler = vi.fn().mockResolvedValue('coach embed');
    discordClient.findButtonHandler.mockReturnValue(handler);

    expect(await service.handle(click('11'))).toBe('coach embed');
    expect(discordClient.findButtonHandler).toHaveBeenCalledWith('coach:42');
    expect(handler.mock.calls[0][0]).toEqual({
      customId: 'coach:42',
      member: null,
    });
  });

  it('re-runs a recorded button that carried no payload', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'button', name: 'coach:', parameters: [] }),
    );
    const handler = vi.fn().mockResolvedValue('ok');
    discordClient.findButtonHandler.mockReturnValue(handler);

    await service.handle(click('11'));

    expect(discordClient.findButtonHandler).toHaveBeenCalledWith('coach:');
  });

  it('replies ephemerally when the button handler is gone', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'button', name: 'old:', parameters: [] }),
    );
    discordClient.findButtonHandler.mockReturnValue(undefined);

    expect(await service.handle(click('11'))).toEqual({
      content: DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('re-runs a recorded select menu with its recorded values in order', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'select_menu',
        name: 'coach:',
        parameters: [
          { key: 'id', value: 'menu:0' },
          { key: 'value', value: '7' },
          { key: 'value', value: '9' },
        ],
      }),
    );
    const handler = vi.fn().mockResolvedValue('menu answer');
    discordClient.findSelectMenuHandler.mockReturnValue(handler);

    expect(await service.handle(click('11'))).toBe('menu answer');
    expect(discordClient.findSelectMenuHandler).toHaveBeenCalledWith(
      'coach:menu:0',
    );
    expect(handler.mock.calls[0][0]).toEqual({
      customId: 'coach:menu:0',
      values: ['7', '9'],
      member: null,
    });
  });

  it('re-runs a recorded select menu with no recorded values as an empty selection', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'select_menu',
        name: 'coach:',
        parameters: [{ key: 'id', value: 'menu:0' }],
      }),
    );
    const handler = vi.fn().mockResolvedValue('menu answer');
    discordClient.findSelectMenuHandler.mockReturnValue(handler);

    await service.handle(click('11'));

    expect(handler.mock.calls[0][0]).toEqual({
      customId: 'coach:menu:0',
      values: [],
      member: null,
    });
  });

  it('replies ephemerally when the select menu handler is gone', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'select_menu', name: 'old:', parameters: [] }),
    );
    discordClient.findSelectMenuHandler.mockReturnValue(undefined);

    expect(await service.handle(click('11'))).toEqual({
      content: DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('returns the retriggered reply unchanged, so the dispatcher replies publicly', async () => {
    events.findById.mockResolvedValue(eventRow({ kind: 'command' }));
    const reply = { embeds: [{ title: 'Orc' }] };
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute: vi.fn().mockResolvedValue(reply),
    });

    expect(await service.handle(click('11'))).toBe(reply);
  });

  it('clears the ephemeral flag from an unrestricted retriggered command reply, preserving the rest', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'insights' }),
    );
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute: vi.fn().mockResolvedValue({
        content: 'x',
        flags: MessageFlags.Ephemeral,
      }),
    });

    expect(await service.handle(click('11'))).toEqual({
      content: 'x',
      flags: 0,
    });
  });

  it('clears only the ephemeral bit from a combined flags value on an unrestricted command, preserving the rest', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'insights' }),
    );
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute: vi.fn().mockResolvedValue({
        content: 'x',
        flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds,
      }),
    });

    expect(await service.handle(click('11'))).toEqual({
      content: 'x',
      flags: MessageFlags.SuppressEmbeds,
    });
  });

  it('passes through a plain string command reply unchanged', async () => {
    events.findById.mockResolvedValue(eventRow({ kind: 'command' }));
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute: vi.fn().mockResolvedValue('plain reply'),
    });

    expect(await service.handle(click('11'))).toBe('plain reply');
  });

  it('passes through a command reply with no flags unchanged', async () => {
    events.findById.mockResolvedValue(eventRow({ kind: 'command' }));
    const reply = { content: 'no flags here' };
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute: vi.fn().mockResolvedValue(reply),
    });

    expect(await service.handle(click('11'))).toEqual(reply);
  });

  it('hands a retriggered command its recorded integer option as a number', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'command',
        name: 'debugtopusers',
        parameters: [{ key: 'days', value: '30' }],
      }),
    );
    let seen: number | null = -1;
    registry.findByName.mockReturnValue({
      name: 'debugtopusers',
      description: 'Debug: List the most active bot users',
      execute: (interaction) => {
        seen = interaction.options.getInteger('days');
        return Promise.resolve('done');
      },
    });

    await service.handle(click('11'));

    expect(seen).toBe(30);
  });

  it('hands a retriggered command null for an integer option it did not record', async () => {
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'debugtopusers', parameters: [] }),
    );
    let seen: number | null = -1;
    registry.findByName.mockReturnValue({
      name: 'debugtopusers',
      description: 'Debug: List the most active bot users',
      execute: (interaction) => {
        seen = interaction.options.getInteger('days');
        return Promise.resolve('done');
      },
    });

    await service.handle(click('11'));

    expect(seen).toBeNull();
  });

  it('hands a retriggered command null for a recorded value that is not an integer', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'command',
        name: 'debugtopusers',
        parameters: [{ key: 'days', value: 'lots' }],
      }),
    );
    let seen: number | null = -1;
    registry.findByName.mockReturnValue({
      name: 'debugtopusers',
      description: 'Debug: List the most active bot users',
      execute: (interaction) => {
        seen = interaction.options.getInteger('days');
        return Promise.resolve('done');
      },
    });

    await service.handle(click('11'));

    expect(seen).toBeNull();
  });

  it('keeps the ephemeral flag on a restricted command retriggered by a member holding the configured role, and still calls execute', async () => {
    const { service, events, registry, discordClient, memberRoleAccess } =
      await makeService('role-1');
    memberRoleAccess.hasRole.mockReturnValue(true);
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'debuginteractions' }),
    );
    const execute = vi.fn().mockResolvedValue({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    registry.findByName.mockReturnValue({
      name: 'debuginteractions',
      description: 'd',
      restrictedRole: 'debug',
      execute,
    });
    const member = { roles: { cache: new Map() } } as unknown as NonNullable<
      ButtonInteraction['member']
    >;

    expect(await service.handle(click('11', member))).toEqual({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    expect(execute).toHaveBeenCalled();
    expect(memberRoleAccess.hasRole).toHaveBeenCalledWith(member, 'role-1');
    expect(discordClient.requiredRoleId).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'debuginteractions' }),
    );
  });

  it('keeps the ephemeral flag on an admin-restricted command retriggered by a role holder', async () => {
    const { service, events, registry, memberRoleAccess } =
      await makeService('admin-role-1');
    memberRoleAccess.hasRole.mockReturnValue(true);
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'importtp' }),
    );
    registry.findByName.mockReturnValue({
      name: 'importtp',
      description: 'd',
      restrictedRole: 'admin',
      execute: vi.fn().mockResolvedValue({
        content: 'x',
        flags: MessageFlags.Ephemeral,
      }),
    });

    expect(await service.handle(click('11'))).toEqual({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    expect(memberRoleAccess.hasRole).toHaveBeenCalledWith(null, 'admin-role-1');
  });

  it('denies retriggering a restricted command when the clicking member lacks the configured role, without calling execute', async () => {
    const { service, events, registry, memberRoleAccess } =
      await makeService('role-1');
    memberRoleAccess.hasRole.mockReturnValue(false);
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'debuginteractions' }),
    );
    const execute = vi.fn().mockResolvedValue('should not run');
    registry.findByName.mockReturnValue({
      name: 'debuginteractions',
      description: 'd',
      restrictedRole: 'debug',
      execute,
    });

    expect(await service.handle(click('11'))).toEqual({
      content: DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('strips the ephemeral flag from an unrestricted command retrigger, without checking any role', async () => {
    const { service, events, registry, memberRoleAccess } =
      await makeService(undefined);
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'insights' }),
    );
    registry.findByName.mockReturnValue({
      name: 'insights',
      description: 'd',
      execute: vi.fn().mockResolvedValue({
        content: 'x',
        flags: MessageFlags.Ephemeral,
      }),
    });

    expect(await service.handle(click('11'))).toEqual({
      content: 'x',
      flags: 0,
    });
    expect(memberRoleAccess.hasRole).not.toHaveBeenCalled();
  });

  it('forwards the real clicking member into the synthetic button interaction, so a second-order retrigger of a restricted command sees the real member', async () => {
    events.findById.mockResolvedValue(
      eventRow({
        kind: 'button',
        name: 'coach:',
        parameters: [{ key: 'id', value: '42' }],
      }),
    );
    const handler = vi.fn().mockResolvedValue('coach embed');
    discordClient.findButtonHandler.mockReturnValue(handler);
    const member = { roles: { cache: new Map() } } as unknown as NonNullable<
      ButtonInteraction['member']
    >;

    await service.handle(click('11', member));

    expect(handler.mock.calls[0][0]).toEqual({
      customId: 'coach:42',
      member,
    });
  });

  it('re-checks the real member on a second-order retrigger of a restricted command, allowing a role holder', async () => {
    const { service, events, registry, discordClient, memberRoleAccess } =
      await makeService('role-1');
    // Event 11 is a past click of the retrigger button for event 22 (a
    // restricted command). Event 22 is the original `debuginteractions`
    // invocation being re-retriggered.
    events.findById.mockImplementation((id) => {
      if (id === 11) {
        return Promise.resolve(
          eventRow({
            id: 11,
            kind: 'button',
            name: DEBUG_RETRIGGER_CUSTOM_ID_PREFIX,
            parameters: [{ key: 'id', value: '22' }],
          }),
        );
      }
      return Promise.resolve(
        eventRow({ id: 22, kind: 'command', name: 'debuginteractions' }),
      );
    });
    const execute = vi.fn().mockResolvedValue({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    registry.findByName.mockReturnValue({
      name: 'debuginteractions',
      description: 'd',
      restrictedRole: 'debug',
      execute,
    });
    // Simulates what the real `DiscordClientService.findButtonHandler` would
    // return for this service's own registered prefix: routing back into
    // `handle` on the same service instance, making the outer click
    // genuinely recursive within this one test.
    discordClient.findButtonHandler.mockReturnValue((interaction) =>
      service.handle(interaction),
    );
    memberRoleAccess.hasRole.mockReturnValue(true);
    const member = { roles: { cache: new Map() } } as unknown as NonNullable<
      ButtonInteraction['member']
    >;

    expect(await service.handle(click('11', member))).toEqual({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    expect(execute).toHaveBeenCalled();
    expect(memberRoleAccess.hasRole).toHaveBeenCalledWith(member, 'role-1');
  });

  it('re-checks the real member on a second-order retrigger of a restricted command, denying a non-holder', async () => {
    const { service, events, registry, discordClient, memberRoleAccess } =
      await makeService('role-1');
    events.findById.mockImplementation((id) => {
      if (id === 11) {
        return Promise.resolve(
          eventRow({
            id: 11,
            kind: 'button',
            name: DEBUG_RETRIGGER_CUSTOM_ID_PREFIX,
            parameters: [{ key: 'id', value: '22' }],
          }),
        );
      }
      return Promise.resolve(
        eventRow({ id: 22, kind: 'command', name: 'debuginteractions' }),
      );
    });
    const execute = vi.fn().mockResolvedValue('should not run');
    registry.findByName.mockReturnValue({
      name: 'debuginteractions',
      description: 'd',
      restrictedRole: 'debug',
      execute,
    });
    discordClient.findButtonHandler.mockReturnValue((interaction) =>
      service.handle(interaction),
    );
    memberRoleAccess.hasRole.mockReturnValue(false);
    const member = { roles: { cache: new Map() } } as unknown as NonNullable<
      ButtonInteraction['member']
    >;

    expect(await service.handle(click('11', member))).toEqual({
      content: DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('behaves as before (execute called, ephemeral flag preserved) when retriggering a restricted command with no role configured', async () => {
    const { service, events, registry, memberRoleAccess } =
      await makeService(undefined);
    events.findById.mockResolvedValue(
      eventRow({ kind: 'command', name: 'debuginteractions' }),
    );
    const execute = vi.fn().mockResolvedValue({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    registry.findByName.mockReturnValue({
      name: 'debuginteractions',
      description: 'd',
      restrictedRole: 'debug',
      execute,
    });

    expect(await service.handle(click('11'))).toEqual({
      content: 'x',
      flags: MessageFlags.Ephemeral,
    });
    expect(execute).toHaveBeenCalled();
    expect(memberRoleAccess.hasRole).not.toHaveBeenCalled();
  });
});
