import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { ON_THIS_DATE_INVALID_DATE_MESSAGE } from '../error-messages';
import { OnThisDateFactsService } from '../insights/facts/on-this-date.service';
import { MonthDayService } from '../shared/month-day.service';
import { InsightsCommandService } from './insights-command.service';
import { OnThisDateCommandService } from './on-this-date-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

function interaction(date: string | null): ChatInputCommandInteraction {
  const mocked = mockDeep<ChatInputCommandInteraction>();
  mocked.options.getString.mockImplementation((name: string) =>
    name === 'date' ? date : null,
  );
  return mocked;
}

describe('OnThisDateCommandService', () => {
  let service: OnThisDateCommandService;
  let facts: DeepMockProxy<OnThisDateFactsService>;
  let monthDay: DeepMockProxy<MonthDayService>;
  let insightsCommand: DeepMockProxy<InsightsCommandService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;

  beforeEach(async () => {
    facts = mockDeep<OnThisDateFactsService>();
    facts.resolve.mockResolvedValue('rendered insight');

    monthDay = mockDeep<MonthDayService>();
    monthDay.parse.mockReturnValue({ month: 2, day: 29 });
    monthDay.today.mockReturnValue({ month: 6, day: 1 });

    insightsCommand = mockDeep<InsightsCommandService>();
    insightsCommand.buildScopeOptions.mockReturnValue([
      {
        name: 'league',
        description: 'Scope the insight to a single league (optional)',
        type: 3,
        autocomplete: true,
      },
    ]);
    insightsCommand.resolveScopeOptions.mockResolvedValue({
      kind: 'ok',
      resolved: {},
    });
    insightsCommand.toFactScope.mockReturnValue({});
    insightsCommand.applyScopeSuffix.mockImplementation((reply) => reply);
    insightsCommand.autocompleteScopeOption.mockResolvedValue(null);

    registry = mockDeep<SlashCommandRegistryService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnThisDateCommandService,
        { provide: OnThisDateFactsService, useValue: facts },
        { provide: MonthDayService, useValue: monthDay },
        { provide: InsightsCommandService, useValue: insightsCommand },
        { provide: SlashCommandRegistryService, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(OnThisDateCommandService);
  });

  it('registers itself on module init', () => {
    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'onthisdate' }),
    );
  });

  it('offers a date option alongside the shared scope options', () => {
    const command = service.buildCommand();

    expect(command.options?.map((option) => option.name)).toEqual([
      'date',
      'league',
    ]);
  });

  it('resolves the named date', async () => {
    const reply = await service.execute(interaction('02-29'));

    expect(reply).toBe('rendered insight');
    expect(monthDay.parse).toHaveBeenCalledWith('02-29');
    expect(facts.resolve).toHaveBeenCalledWith({
      monthDay: { month: 2, day: 29 },
      scope: {},
    });
  });

  it('defaults to today when the option is omitted', async () => {
    await service.execute(interaction(null));

    expect(monthDay.parse).not.toHaveBeenCalled();
    expect(facts.resolve).toHaveBeenCalledWith({
      monthDay: { month: 6, day: 1 },
      scope: {},
    });
  });

  it('rejects an unparseable date instead of falling back to today', async () => {
    monthDay.parse.mockReturnValue(null);

    const reply = await service.execute(interaction('not-a-date'));

    expect(reply).toBe(ON_THIS_DATE_INVALID_DATE_MESSAGE);
    expect(facts.resolve).not.toHaveBeenCalled();
  });

  it('reports a scope that could not be resolved', async () => {
    insightsCommand.resolveScopeOptions.mockResolvedValue({
      kind: 'error',
      message: 'no such era',
    });

    const reply = await service.execute(interaction('02-29'));

    expect(reply).toBe('no such era');
    expect(facts.resolve).not.toHaveBeenCalled();
  });

  it('passes the resolved scope through and suffixes the reply title', async () => {
    const resolved = { era: { id: 7, name: 'Era Seven' } };
    insightsCommand.resolveScopeOptions.mockResolvedValue({
      kind: 'ok',
      resolved,
    });
    insightsCommand.toFactScope.mockReturnValue({ eraId: 7 });

    const reply = await service.execute(interaction('02-29'));

    expect(facts.resolve).toHaveBeenCalledWith({
      monthDay: { month: 2, day: 29 },
      scope: { eraId: 7 },
    });
    expect(insightsCommand.applyScopeSuffix).toHaveBeenCalledWith(
      'rendered insight',
      resolved,
    );
    expect(reply).toBe('rendered insight');
  });

  it('delegates scope autocomplete', async () => {
    const choices = [{ name: 'Era Seven', value: '7' }];
    insightsCommand.autocompleteScopeOption.mockResolvedValue(choices);

    const result =
      await service.autocomplete(
        mockDeep<Parameters<OnThisDateCommandService['autocomplete']>[0]>(),
      );

    expect(result).toEqual(choices);
  });

  it('offers nothing for the date option, which is free text', async () => {
    const result =
      await service.autocomplete(
        mockDeep<Parameters<OnThisDateCommandService['autocomplete']>[0]>(),
      );

    expect(result).toEqual([]);
  });
});
