import type { InteractionEventRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, User } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { DEBUG_INTERACTIONS_NO_RESULTS_MESSAGE } from '../error-messages';
import { DebugInteractionRowFormatterService } from './debug-interaction-row-formatter.service';
import {
  DebugInteractionsCommandService,
  MAX_DEBUG_INTERACTIONS,
} from './debug-interactions-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

const OCCURRED_AT = new Date('2026-09-09T12:00:00.000Z');

function eventRow(
  overrides: Partial<InteractionEventRow> = {},
): InteractionEventRow {
  return {
    occurredAt: OCCURRED_AT,
    kind: 'command',
    name: 'insights',
    outcome: 'success',
    errorMessage: null,
    parameters: [],
    ...overrides,
  };
}

/** A `/debuginteractions` invocation with the given option values. */
function interaction(options: {
  user?: string;
  outcome?: string;
}): ChatInputCommandInteraction {
  const mocked = mockDeep<ChatInputCommandInteraction>();
  mocked.options.getUser.mockImplementation((name: string) =>
    name === 'user' && options.user !== undefined
      ? ({ id: options.user } as User)
      : null,
  );
  mocked.options.getString.mockImplementation((name: string) =>
    name === 'outcome' ? (options.outcome ?? null) : null,
  );
  return mocked;
}

describe('DebugInteractionsCommandService', () => {
  let service: DebugInteractionsCommandService;
  let events: DeepMockProxy<InteractionEventsQueryService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;

  beforeEach(async () => {
    events = mockDeep<InteractionEventsQueryService>();
    events.listRecent.mockResolvedValue([eventRow()]);
    registry = mockDeep<SlashCommandRegistryService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebugInteractionsCommandService,
        // Real, per the pure dependency-free formatting service carve-out in
        // CLAUDE.md: mocking it would leave the rendered rows unasserted.
        DebugInteractionRowFormatterService,
        { provide: InteractionEventsQueryService, useValue: events },
        { provide: SlashCommandRegistryService, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(DebugInteractionsCommandService);
  });

  it('registers itself on module init', () => {
    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'debuginteractions' }),
    );
  });

  it('carries the shared debug prefix in its name and description', () => {
    const command = service.buildCommand();

    expect(command.name).toBe('debuginteractions');
    expect(command.description).toBe('Debug: List recent bot interactions');
  });

  it('offers optional user and outcome options', () => {
    const command = service.buildCommand();

    expect(command.options?.map((option) => option.name)).toEqual([
      'user',
      'outcome',
    ]);
    expect(
      command.options?.every(
        (option) => (option as { required?: boolean }).required !== true,
      ),
    ).toBe(true);
  });

  it('offers exactly the two outcome choices', () => {
    const command = service.buildCommand();
    const outcome = command.options?.[1] as {
      choices?: { name: string; value: string }[];
    };

    expect(outcome.choices).toEqual([
      { name: 'Success', value: 'success' },
      { name: 'Failure', value: 'failure' },
    ]);
  });

  it('lists unfiltered when neither option is given', async () => {
    await service.execute(interaction({}));

    expect(events.listRecent).toHaveBeenCalledWith({
      discordUserId: undefined,
      outcome: undefined,
      limit: MAX_DEBUG_INTERACTIONS,
    });
  });

  it('filters to the picked user', async () => {
    await service.execute(interaction({ user: 'u1' }));

    expect(events.listRecent).toHaveBeenCalledWith({
      discordUserId: 'u1',
      outcome: undefined,
      limit: MAX_DEBUG_INTERACTIONS,
    });
  });

  it('filters to the chosen outcome', async () => {
    await service.execute(interaction({ outcome: 'failure' }));

    expect(events.listRecent).toHaveBeenCalledWith({
      discordUserId: undefined,
      outcome: 'failure',
      limit: MAX_DEBUG_INTERACTIONS,
    });
  });

  it('combines both filters', async () => {
    await service.execute(interaction({ user: 'u1', outcome: 'success' }));

    expect(events.listRecent).toHaveBeenCalledWith({
      discordUserId: 'u1',
      outcome: 'success',
      limit: MAX_DEBUG_INTERACTIONS,
    });
  });

  it('caps the listing at twenty rows', () => {
    expect(MAX_DEBUG_INTERACTIONS).toBe(20);
  });

  it('replies with one embed row per interaction', async () => {
    events.listRecent.mockResolvedValue([
      eventRow({ name: 'insights' }),
      eventRow({
        kind: 'button',
        name: 'coach:42',
        outcome: 'failure',
        errorMessage: 'boom',
      }),
    ]);

    const reply = await service.execute(interaction({}));

    expect(reply).toEqual({
      embeds: [
        {
          title: 'Recent interactions',
          description:
            '<t:1788955200:f> — /insights — ✅\n<t:1788955200:f> — button coach:42 — ❌ boom',
        },
      ],
      flags: MessageFlags.Ephemeral,
    });
  });

  it('replies with the no-results message and no embed when nothing matches', async () => {
    events.listRecent.mockResolvedValue([]);

    const reply = await service.execute(interaction({}));

    expect(reply).toEqual({
      content: DEBUG_INTERACTIONS_NO_RESULTS_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('always replies ephemerally', async () => {
    events.listRecent.mockResolvedValue([]);
    const empty = await service.execute(interaction({}));
    events.listRecent.mockResolvedValue([eventRow()]);
    const filled = await service.execute(interaction({}));

    for (const reply of [empty, filled]) {
      expect(reply).toMatchObject({ flags: MessageFlags.Ephemeral });
    }
  });
});
