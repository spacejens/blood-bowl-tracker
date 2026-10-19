import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MakeServiceResult } from './insights-command.service.test-helpers';
import {
  autocompleteInteraction,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — bootstrap and autocomplete', () => {
  let harness: MakeServiceResult;

  beforeEach(async () => {
    harness = await makeService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an insights command definition with an autocompleted category option', () => {
    const { service } = harness;
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
    const { service, factTreeUtils, factTree } = harness;
    factTreeUtils.nextSegmentCompletions.mockReturnValue(['coach.toplist']);
    const choices = await service.autocomplete(
      autocompleteInteraction('category', 'coach.'),
    );
    expect(factTreeUtils.nextSegmentCompletions).toHaveBeenCalledWith(
      factTree,
      'coach.',
    );
    expect(choices).toEqual([
      { name: 'coach.toplist', value: 'coach.toplist' },
    ]);
  });

  it('caps category autocomplete choices at 25', async () => {
    const { service, factTreeUtils } = harness;
    factTreeUtils.nextSegmentCompletions.mockReturnValue(
      Array.from({ length: 30 }, (_v, i) => `p${i}`),
    );
    const choices = await service.autocomplete(
      autocompleteInteraction('category', 'p'),
    );
    expect(choices).toHaveLength(25);
  });

  it('registers the insights command with the registry on init', () => {
    const { service, registry } = harness;
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledTimes(1);
    const command = registry.register.mock.calls[0][0] as { name: string };
    expect(command.name).toBe('insights');
  });

  it('advertises league, era, and competition options alongside category', () => {
    const { service } = harness;
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
    const { service, eras } = harness;
    eras.searchByNamePrefix.mockResolvedValue([
      { id: 20, name: 'BB2020', leagueName: 'Premier League' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('era', 'bb'),
    );
    expect(choices).toEqual([{ name: 'BB2020 (Premier League)', value: '20' }]);
  });

  it('advertises a competition option alongside category, league and era', () => {
    const { service } = harness;
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
    const { service, competitions } = harness;
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

  it('advertises the match-category option last, with static choices instead of autocomplete', () => {
    const { service } = harness;
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

  it('labels every match-category choice through MatchCategoryLabelService', () => {
    const { service, categoryLabel } = harness;
    service.buildCommand();
    expect(categoryLabel.label).toHaveBeenCalledTimes(6);
    expect(categoryLabel.label).toHaveBeenCalledWith('season_final');
  });
});
