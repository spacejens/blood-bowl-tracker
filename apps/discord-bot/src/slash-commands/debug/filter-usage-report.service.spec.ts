import type { CommandInvocationRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { ApplicationCommandOptionType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { FilterUsageReportService } from './filter-usage-report.service';

/**
 * A registered command with the given option names, every one declared
 * optional unless it is listed in `required`.
 */
function command(
  name: string,
  optionNames: string[],
  required: string[] = [],
): SlashCommandDefinition {
  return {
    name,
    description: `the ${name} command`,
    options: optionNames.map((optionName) => ({
      name: optionName,
      description: `the ${optionName} option`,
      type: ApplicationCommandOptionType.String,
      required: required.includes(optionName),
    })),
    execute: vi.fn(),
  };
}

function invocation(
  overrides: Partial<CommandInvocationRow> = {},
): CommandInvocationRow {
  return {
    discordUserId: '100',
    username: 'coach42',
    commandName: 'insights',
    parameterKeys: [],
    ...overrides,
  };
}

describe('FilterUsageReportService', () => {
  let service: FilterUsageReportService;
  let events: DeepMockProxy<InteractionEventsQueryService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;

  beforeEach(async () => {
    events = mockDeep<InteractionEventsQueryService>();
    events.commandInvocations.mockResolvedValue([]);
    registry = mockDeep<SlashCommandRegistryService>();
    registry.all.mockReturnValue([
      command('insights', ['category', 'league', 'era']),
      command('deepdive', ['coach', 'team']),
      command('allrequired', ['date'], ['date']),
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FilterUsageReportService,
        { provide: InteractionEventsQueryService, useValue: events },
        { provide: SlashCommandRegistryService, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(FilterUsageReportService);
  });

  it('passes sinceDays through to the query', async () => {
    await service.report({ sinceDays: 30 });

    expect(events.commandInvocations).toHaveBeenCalledWith({ sinceDays: 30 });
  });

  it('queries every recorded invocation when no window is given', async () => {
    await service.report({});

    expect(events.commandInvocations).toHaveBeenCalledWith({
      sinceDays: undefined,
    });
  });

  it('lists a user who supplied an optional option under usesFilters', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ parameterKeys: ['category', 'league'] }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({
      usesFilters: [{ username: 'coach42' }],
      plainOnly: [],
    });
  });

  it('lists a user who never supplied one under plainOnly, with the count', async () => {
    registry.all.mockReturnValue([
      command('insights', ['category', 'league'], ['category']),
    ]);
    events.commandInvocations.mockResolvedValue([
      invocation({ parameterKeys: ['category'] }),
      invocation({ parameterKeys: ['category'] }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({
      usesFilters: [],
      plainOnly: [{ username: 'coach42', eligibleCount: 2 }],
    });
  });

  it('counts an invocation with no options at all as plain', async () => {
    events.commandInvocations.mockResolvedValue([invocation()]);

    const report = await service.report({});

    expect(report.plainOnly).toEqual([
      { username: 'coach42', eligibleCount: 1 },
    ]);
  });

  it('treats one filtered invocation among many plain ones as using filters', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation(),
      invocation(),
      invocation({ parameterKeys: ['era'] }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({
      usesFilters: [{ username: 'coach42' }],
      plainOnly: [],
    });
  });

  it('ignores invocations of a command with no optional options', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ commandName: 'allrequired', parameterKeys: ['date'] }),
      invocation({ commandName: 'insights' }),
    ]);

    const report = await service.report({});

    expect(report.plainOnly).toEqual([
      { username: 'coach42', eligibleCount: 1 },
    ]);
  });

  it('omits a user who only ever used commands with no optional options', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ commandName: 'allrequired', parameterKeys: ['date'] }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({ usesFilters: [], plainOnly: [] });
  });

  it('ignores invocations of a command nothing registers any more', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ commandName: 'removedcommand', parameterKeys: ['gone'] }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({ usesFilters: [], plainOnly: [] });
  });

  it('does not count a supplied option that belongs to another command', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ commandName: 'deepdive', parameterKeys: ['era'] }),
    ]);

    const report = await service.report({});

    expect(report.plainOnly).toEqual([
      { username: 'coach42', eligibleCount: 1 },
    ]);
  });

  it('aggregates each user separately', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ discordUserId: '100', username: 'alice' }),
      invocation({
        discordUserId: '200',
        username: 'bob',
        parameterKeys: ['era'],
      }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({
      usesFilters: [{ username: 'bob' }],
      plainOnly: [{ username: 'alice', eligibleCount: 1 }],
    });
  });

  it('sorts plainOnly by eligible count descending', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ discordUserId: '100', username: 'alice' }),
      invocation({ discordUserId: '200', username: 'bob' }),
      invocation({ discordUserId: '200', username: 'bob' }),
      invocation({ discordUserId: '200', username: 'bob' }),
    ]);

    const report = await service.report({});

    expect(report.plainOnly).toEqual([
      { username: 'bob', eligibleCount: 3 },
      { username: 'alice', eligibleCount: 1 },
    ]);
  });

  it('breaks a plainOnly count tie on the username ascending', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({ discordUserId: '100', username: 'zoe' }),
      invocation({ discordUserId: '200', username: 'amy' }),
    ]);

    const report = await service.report({});

    expect(report.plainOnly.map((user) => user.username)).toEqual([
      'amy',
      'zoe',
    ]);
  });

  it('sorts usesFilters alphabetically by username', async () => {
    events.commandInvocations.mockResolvedValue([
      invocation({
        discordUserId: '100',
        username: 'zoe',
        parameterKeys: ['era'],
      }),
      invocation({
        discordUserId: '200',
        username: 'amy',
        parameterKeys: ['era'],
      }),
    ]);

    const report = await service.report({});

    expect(report.usesFilters.map((user) => user.username)).toEqual([
      'amy',
      'zoe',
    ]);
  });

  it('treats an option with no required flag at all as optional', async () => {
    registry.all.mockReturnValue([
      {
        name: 'insights',
        description: 'the insights command',
        options: [
          {
            name: 'category',
            description: 'the category option',
            type: ApplicationCommandOptionType.String,
          },
        ],
        execute: vi.fn(),
      },
    ]);
    events.commandInvocations.mockResolvedValue([
      invocation({ parameterKeys: ['category'] }),
    ]);

    const report = await service.report({});

    expect(report.usesFilters).toEqual([{ username: 'coach42' }]);
  });

  it('ignores a command registered with no options at all', async () => {
    registry.all.mockReturnValue([
      { name: 'insights', description: 'a', execute: vi.fn() },
    ]);
    events.commandInvocations.mockResolvedValue([invocation()]);

    const report = await service.report({});

    expect(report).toEqual({ usesFilters: [], plainOnly: [] });
  });

  it('excludes a debug-prefixed command even when a user supplied its optional option', async () => {
    registry.all.mockReturnValue([
      command('debugtopusers', ['days']),
      command('insights', ['category']),
    ]);
    events.commandInvocations.mockResolvedValue([
      invocation({ commandName: 'debugtopusers', parameterKeys: ['days'] }),
    ]);

    const report = await service.report({});

    expect(report).toEqual({ usesFilters: [], plainOnly: [] });
  });

  it('reports nothing when no invocation was recorded', async () => {
    events.commandInvocations.mockResolvedValue([]);

    const report = await service.report({});

    expect(report).toEqual({ usesFilters: [], plainOnly: [] });
  });
});
