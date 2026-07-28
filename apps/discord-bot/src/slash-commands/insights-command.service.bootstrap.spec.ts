import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  autocompleteInteraction,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — bootstrap and autocomplete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an insights command definition with an autocompleted category option', async () => {
    const { service } = await makeService();
    const command = service.buildCommand();
    expect(command.name).toBe('insights');
    expect(command.description).toEqual(expect.any(String));
    expect(command.options?.[0]).toEqual({
      name: 'category',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real string
      description: expect.any(String),
      type: 3,
      autocomplete: true,
    });
    expect(command.autocomplete).toEqual(expect.any(Function));
  });

  it('returns category autocomplete choices for the focused partial path', async () => {
    const { service } = await makeService();
    const choices = await service.autocomplete(
      autocompleteInteraction('category', 'coach.'),
    );
    expect(choices).toEqual([
      { name: 'coach.toplist', value: 'coach.toplist' },
    ]);
  });

  it('registers the insights command with the registry on init', async () => {
    const { service, registry } = await makeService();
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledTimes(1);
    const command = registry.register.mock.calls[0][0] as { name: string };
    expect(command.name).toBe('insights');
  });

  it('advertises league, era, and competition options alongside category', async () => {
    const { service } = await makeService();
    const command = service.buildCommand();
    expect(command.options).toEqual([
      {
        name: 'category',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'league',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'era',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'competition',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'match-category',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        choices: [
          { name: 'Label for normal', value: 'normal' },
          { name: 'Label for cup_final', value: 'cup_final' },
          { name: 'Label for season_semi_final', value: 'season_semi_final' },
          { name: 'Label for season_final', value: 'season_final' },
          { name: 'Label for season_bronze', value: 'season_bronze' },
          { name: 'Label for season_qualifier', value: 'season_qualifier' },
        ],
      },
    ]);
  });

  it('returns era autocomplete choices labelled "<name> (<league>)" with id values', async () => {
    const { service, eras } = await makeService();
    eras.searchByNamePrefix.mockResolvedValue([
      { id: 20, name: 'BB2020', leagueName: 'Premier League' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('era', 'bb'),
    );
    expect(choices).toEqual([{ name: 'BB2020 (Premier League)', value: '20' }]);
  });

  it('advertises a competition option alongside category, league and era', async () => {
    const { service } = await makeService();
    const command = service.buildCommand();
    expect(command.options).toHaveLength(5);
    expect(command.options?.[3]).toEqual({
      name: 'competition',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
      description: expect.any(String),
      type: 3,
      autocomplete: true,
    });
  });

  it('returns competition autocomplete choices labelled "<name> (<league>)" with id values', async () => {
    const { service, competitions } = await makeService();
    competitions.searchByNamePrefix.mockResolvedValue([
      { id: 30, name: 'Major Season 24', leagueName: 'The Major' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('competition', 'maj'),
    );
    expect(choices).toEqual([
      { name: 'Major Season 24 (The Major)', value: '30' },
    ]);
  });

  it('advertises the match-category option last, with static choices instead of autocomplete', async () => {
    const { service } = await makeService();
    const command = service.buildCommand();
    const option = command.options?.[4] as {
      name: string;
      autocomplete?: boolean;
      choices?: { name: string; value: string }[];
    };
    expect(option.name).toBe('match-category');
    expect(option.autocomplete).toBeUndefined();
    expect(option.choices).toHaveLength(6);
  });

  it('labels every match-category choice through MatchCategoryLabelService', async () => {
    const { service, categoryLabel } = await makeService();
    service.buildCommand();
    expect(categoryLabel.label).toHaveBeenCalledTimes(6);
    expect(categoryLabel.label).toHaveBeenCalledWith('season_final');
  });
});
