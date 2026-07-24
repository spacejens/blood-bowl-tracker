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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
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
    expect(command.options).toHaveLength(4);
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
});
