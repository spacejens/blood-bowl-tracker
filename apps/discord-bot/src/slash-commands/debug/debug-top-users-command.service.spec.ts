import type { TopUserRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { DEBUG_TOP_USERS_NO_RESULTS_MESSAGE } from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import {
  DebugTopUsersCommandService,
  MAX_DEBUG_TOP_USERS,
} from './debug-top-users-command.service';

function topUserRow(overrides: Partial<TopUserRow> = {}): TopUserRow {
  return {
    discordUserId: '100',
    username: 'coach42',
    interactionCount: 7,
    ...overrides,
  };
}

/** A `/debugtopusers` invocation with the given option values. */
function interaction(options: {
  kind?: string;
  days?: number;
}): ChatInputCommandInteraction {
  const mocked = mockDeep<ChatInputCommandInteraction>();
  mocked.options.getString.mockImplementation((name: string) =>
    name === 'kind' ? (options.kind ?? null) : null,
  );
  mocked.options.getInteger.mockImplementation((name: string) =>
    name === 'days' ? (options.days ?? null) : null,
  );
  return mocked;
}

/** The rendered description of a reply that carries an embed. */
function description(reply: unknown): string {
  return (reply as { embeds: { description: string }[] }).embeds[0].description;
}

describe('DebugTopUsersCommandService', () => {
  let service: DebugTopUsersCommandService;
  let events: DeepMockProxy<InteractionEventsQueryService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;

  beforeEach(async () => {
    events = mockDeep<InteractionEventsQueryService>();
    events.topUsers.mockResolvedValue([topUserRow()]);
    registry = mockDeep<SlashCommandRegistryService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebugTopUsersCommandService,
        { provide: InteractionEventsQueryService, useValue: events },
        { provide: SlashCommandRegistryService, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(DebugTopUsersCommandService);
  });

  it('registers itself on module init', () => {
    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'debugtopusers' }),
    );
  });

  it('carries the shared debug prefix in its name and description', () => {
    const command = service.buildCommand();

    expect(command.name).toBe('debugtopusers');
    expect(command.description).toBe('Debug: List the most active bot users');
  });

  it('offers optional kind and days options', () => {
    const command = service.buildCommand();

    expect(command.options?.map((option) => option.name)).toEqual([
      'kind',
      'days',
    ]);
    expect(
      command.options?.every(
        (option) => (option as { required?: boolean }).required !== true,
      ),
    ).toBe(true);
  });

  it('offers exactly the three interaction-kind choices', () => {
    const command = service.buildCommand();
    const kind = command.options?.[0] as {
      choices?: { name: string; value: string }[];
    };

    expect(kind.choices).toEqual([
      { name: 'Command', value: 'command' },
      { name: 'Button click', value: 'button' },
      { name: 'Select menu', value: 'select_menu' },
    ]);
  });

  it('counts every kind, all-time, when neither option is given', async () => {
    await service.execute(interaction({}));

    expect(events.topUsers).toHaveBeenCalledWith({
      kind: undefined,
      sinceDays: undefined,
      limit: MAX_DEBUG_TOP_USERS,
    });
  });

  it('narrows to the chosen interaction kind', async () => {
    await service.execute(interaction({ kind: 'button' }));

    expect(events.topUsers).toHaveBeenCalledWith({
      kind: 'button',
      sinceDays: undefined,
      limit: MAX_DEBUG_TOP_USERS,
    });
  });

  it('narrows to the given number of days', async () => {
    await service.execute(interaction({ days: 30 }));

    expect(events.topUsers).toHaveBeenCalledWith({
      kind: undefined,
      sinceDays: 30,
      limit: MAX_DEBUG_TOP_USERS,
    });
  });

  it('combines both filters', async () => {
    await service.execute(interaction({ kind: 'command', days: 7 }));

    expect(events.topUsers).toHaveBeenCalledWith({
      kind: 'command',
      sinceDays: 7,
      limit: MAX_DEBUG_TOP_USERS,
    });
  });

  it('caps the leaderboard at twenty rows', () => {
    expect(MAX_DEBUG_TOP_USERS).toBe(20);
  });

  it('replies with one ranked embed row per user', async () => {
    events.topUsers.mockResolvedValue([
      topUserRow({ username: 'alice', interactionCount: 42 }),
      topUserRow({
        discordUserId: '200',
        username: 'bob',
        interactionCount: 17,
      }),
    ]);

    const reply = await service.execute(interaction({}));

    expect(reply).toEqual({
      embeds: [
        {
          title: 'Top bot users',
          description:
            '1. **alice** — 42 interactions\n2. **bob** — 17 interactions',
        },
      ],
      flags: MessageFlags.Ephemeral,
    });
  });

  it('ranks the rows in the order the query returned them', async () => {
    events.topUsers.mockResolvedValue([
      topUserRow({ username: 'first', interactionCount: 3 }),
      topUserRow({ username: 'second', interactionCount: 3 }),
      topUserRow({ username: 'third', interactionCount: 1 }),
    ]);

    const reply = await service.execute(interaction({}));

    expect(description(reply).split('\n')).toEqual([
      '1. **first** — 3 interactions',
      '2. **second** — 3 interactions',
      '3. **third** — 1 interaction',
    ]);
  });

  it('replies with the no-results message and no embed when nothing matches', async () => {
    events.topUsers.mockResolvedValue([]);

    const reply = await service.execute(interaction({ days: 1 }));

    expect(reply).toEqual({
      content: DEBUG_TOP_USERS_NO_RESULTS_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('truncates the description to the safety-net limit when it would overflow', async () => {
    events.topUsers.mockResolvedValue(
      Array.from({ length: MAX_DEBUG_TOP_USERS }, (_unused, index) =>
        topUserRow({
          discordUserId: String(index),
          username: 'x'.repeat(400),
        }),
      ),
    );

    const reply = await service.execute(interaction({}));

    expect(description(reply)).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(description(reply).endsWith('…')).toBe(true);
  });

  it('always replies ephemerally', async () => {
    events.topUsers.mockResolvedValue([]);
    const empty = await service.execute(interaction({}));
    events.topUsers.mockResolvedValue([topUserRow()]);
    const filled = await service.execute(interaction({}));

    for (const reply of [empty, filled]) {
      expect(reply).toMatchObject({ flags: MessageFlags.Ephemeral });
    }
  });
});
