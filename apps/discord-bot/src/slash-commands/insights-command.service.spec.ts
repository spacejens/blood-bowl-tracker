import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InsightsCommandService } from './insights-command.service';

function makeService() {
  const zero = () => ({ countAll: vi.fn().mockResolvedValue(0) });
  const coaches = {
    countMatchesPlayedByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 9 }]),
    countTeamsByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    countAll: vi.fn().mockResolvedValue(0),
  } as unknown as CoachesService;
  const teams = {
    countMatchesPlayedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 12 }]),
    countAll: vi.fn().mockResolvedValue(0),
  } as unknown as TeamsService;
  const matches = {
    countAll: vi.fn().mockResolvedValue(0),
    countMatchEvents: vi.fn().mockResolvedValue(0),
  } as unknown as MatchesService;
  const competitions = {
    countAll: vi.fn().mockResolvedValue(0),
    countByType: vi.fn().mockResolvedValue(0),
  } as unknown as CompetitionsService;
  const leagues = zero() as unknown as LeaguesService;
  const rulesSets = zero() as unknown as RulesSetsService;
  const eras = zero() as unknown as ErasService;
  const players = zero() as unknown as PlayersService;
  const positions = zero() as unknown as PositionsService;
  const races = zero() as unknown as RacesService;
  const externalSystems = zero() as unknown as ExternalSystemsService;
  return {
    service: new InsightsCommandService(
      coaches,
      teams,
      matches,
      competitions,
      leagues,
      rulesSets,
      eras,
      players,
      positions,
      races,
      externalSystems,
    ),
    coaches,
    teams,
  };
}

function chatInput(category: string | null): ChatInputCommandInteraction {
  return {
    options: { getString: vi.fn().mockReturnValue(category) },
  } as unknown as ChatInputCommandInteraction;
}

function autocompleteInteraction(focused: string): AutocompleteInteraction {
  return {
    options: { getFocused: vi.fn().mockReturnValue(focused) },
  } as unknown as AutocompleteInteraction;
}

describe('InsightsCommandService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an insights command definition with an autocompleted category option', () => {
    const { service } = makeService();
    const command = service.buildCommand();
    expect(command.name).toBe('insights');
    expect(command.description).toEqual(expect.any(String));
    expect(command.options).toEqual([
      {
        name: 'category',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real string
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
    ]);
    expect(command.autocomplete).toEqual(expect.any(Function));
  });

  it('resolves an exact leaf path to that fact', async () => {
    const { service, coaches } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played',
          description: '1. Roze Madder — 9',
        },
      ],
    });
  });

  it('picks a random leaf under a branch path', async () => {
    const { service, coaches } = makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput('coach'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('picks a random leaf across the whole tree when no category is given', async () => {
    const { service, coaches } = makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('resolveRandomFact picks a random leaf across the whole tree', async () => {
    const { service, coaches } = makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.resolveRandomFact();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('returns the apothecary fallback for an unknown path', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput('coach.nope'));
    expect(result).toBe("Even the Apothecary can't make sense of that one.");
  });

  it('returns autocomplete choices for the focused partial path', async () => {
    const { service } = makeService();
    const choices = await service.autocomplete(
      autocompleteInteraction('coach.'),
    );
    expect(choices).toEqual([
      { name: 'coach.toplist', value: 'coach.toplist' },
    ]);
  });
});
