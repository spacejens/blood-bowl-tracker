import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { DEBUG_NO_USAGE_RECORDED_MESSAGE } from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { DebugFilterUsageCommandService } from './debug-filter-usage-command.service';
import { FilterUsageReportService } from './filter-usage-report.service';

/** A `/debugfilterusage` invocation with the given option values. */
function interaction(options: { days?: number }): ChatInputCommandInteraction {
  const mocked = mockDeep<ChatInputCommandInteraction>();
  mocked.options.getInteger.mockImplementation((name: string) =>
    name === 'days' ? (options.days ?? null) : null,
  );
  return mocked;
}

/** The rendered description of a reply that carries an embed. */
function description(reply: unknown): string {
  return (reply as { embeds: { description: string }[] }).embeds[0].description;
}

describe('DebugFilterUsageCommandService', () => {
  let service: DebugFilterUsageCommandService;
  let filterUsage: DeepMockProxy<FilterUsageReportService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;

  beforeEach(async () => {
    filterUsage = mockDeep<FilterUsageReportService>();
    filterUsage.report.mockResolvedValue({
      usesFilters: [{ username: 'alice' }],
      plainOnly: [{ username: 'bob', eligibleCount: 4 }],
    });
    registry = mockDeep<SlashCommandRegistryService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebugFilterUsageCommandService,
        { provide: FilterUsageReportService, useValue: filterUsage },
        { provide: SlashCommandRegistryService, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(DebugFilterUsageCommandService);
  });

  it('registers itself on module init', () => {
    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'debugfilterusage' }),
    );
  });

  it('carries the shared debug prefix in its name and description', () => {
    const command = service.buildCommand();

    expect(command.name).toBe('debugfilterusage');
    expect(command.description).toBe(
      'Debug: Report who uses optional filters vs. plain commands',
    );
  });

  it('offers one optional days option, at least 1', () => {
    const command = service.buildCommand();

    expect(command.options?.map((option) => option.name)).toEqual(['days']);
    const option = command.options?.[0];
    expect(
      option === undefined ||
        !('required' in option) ||
        option.required !== true,
    ).toBe(true);
    expect((option as { minValue?: number }).minValue).toBe(1);
  });

  it('reports all-time when the days option is omitted', async () => {
    await service.execute(interaction({}));

    expect(filterUsage.report).toHaveBeenCalledWith({ sinceDays: undefined });
  });

  it('narrows to the given number of days', async () => {
    await service.execute(interaction({ days: 30 }));

    expect(filterUsage.report).toHaveBeenCalledWith({ sinceDays: 30 });
  });

  it('replies with both headed sections, plain-only first', async () => {
    filterUsage.report.mockResolvedValue({
      usesFilters: [{ username: 'alice' }, { username: 'carol' }],
      plainOnly: [
        { username: 'bob', eligibleCount: 4 },
        { username: 'dave', eligibleCount: 1 },
      ],
    });

    const reply = await service.execute(interaction({}));

    expect(reply).toEqual({
      embeds: [
        {
          title: 'Filter usage',
          description: [
            '**Plain only**',
            '- bob — 4 invocations',
            '- dave — 1 invocation',
            '',
            '**Uses filters**',
            '- alice',
            '- carol',
          ].join('\n'),
        },
      ],
      flags: MessageFlags.Ephemeral,
    });
  });

  it('omits the uses-filters section when nobody uses filters', async () => {
    filterUsage.report.mockResolvedValue({
      usesFilters: [],
      plainOnly: [{ username: 'bob', eligibleCount: 2 }],
    });

    const reply = await service.execute(interaction({}));

    expect(description(reply)).toBe('**Plain only**\n- bob — 2 invocations');
  });

  it('omits the plain-only section when everybody uses filters', async () => {
    filterUsage.report.mockResolvedValue({
      usesFilters: [{ username: 'alice' }],
      plainOnly: [],
    });

    const reply = await service.execute(interaction({}));

    expect(description(reply)).toBe('**Uses filters**\n- alice');
  });

  it('replies with the no-results message and no embed when both lists are empty', async () => {
    filterUsage.report.mockResolvedValue({ usesFilters: [], plainOnly: [] });

    const reply = await service.execute(interaction({ days: 1 }));

    expect(reply).toEqual({
      content: DEBUG_NO_USAGE_RECORDED_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('truncates the description to the safety-net limit when it would overflow', async () => {
    filterUsage.report.mockResolvedValue({
      usesFilters: Array.from({ length: 40 }, () => ({
        username: 'x'.repeat(200),
      })),
      plainOnly: [{ username: 'y'.repeat(200), eligibleCount: 1 }],
    });

    const reply = await service.execute(interaction({}));

    expect(description(reply)).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(description(reply).endsWith('…')).toBe(true);
  });

  it('always replies ephemerally', async () => {
    filterUsage.report.mockResolvedValue({ usesFilters: [], plainOnly: [] });
    const empty = await service.execute(interaction({}));
    filterUsage.report.mockResolvedValue({
      usesFilters: [{ username: 'alice' }],
      plainOnly: [],
    });
    const filled = await service.execute(interaction({}));

    for (const reply of [empty, filled]) {
      expect(reply).toMatchObject({ flags: MessageFlags.Ephemeral });
    }
  });
});
