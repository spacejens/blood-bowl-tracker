import type { CompetitionsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { resolveCompetitionDeepdive } from './competition-deepdive';

function makeServices(options: {
  competition?: {
    id: number;
    name: string;
    type: 'season' | 'cup';
    eraId: number;
    eraName: string;
  };
  teams?: { id: number; name: string }[];
}): { competitions: CompetitionsService } {
  const competitions = {
    findByIdWithEra: vi.fn().mockResolvedValue(options.competition),
    listTeams: vi.fn().mockResolvedValue(options.teams ?? []),
  } as unknown as CompetitionsService;
  return { competitions };
}

describe('resolveCompetitionDeepdive', () => {
  it('returns the not-found message when the competition does not exist', async () => {
    const result = await resolveCompetitionDeepdive(
      999,
      makeServices({ competition: undefined }),
    );
    expect(result).toBe(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
  });

  it('renders the type, era line, and participating-teams list with buttons', async () => {
    const services = makeServices({
      competition: {
        id: 1,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        eraName: 'BB2020',
      },
      teams: [
        { id: 5, name: 'Gouged Eye' },
        { id: 9, name: 'Reikland Reavers' },
      ],
    });
    const result = (await resolveCompetitionDeepdive(
      1,
      services,
    )) as unknown as {
      embeds: { title: string; description: string }[];
      components: { components: { label: string; custom_id: string }[] }[];
    };
    expect(result.embeds[0]).toEqual({
      title: 'Major Season 24',
      description: [
        'Type: season',
        'Era: BB2020',
        '',
        'Participating teams:',
        'Gouged Eye',
        'Reikland Reavers',
      ].join('\n'),
    });
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      'deepdive:era:20',
      'deepdive:team:5',
      'deepdive:team:9',
    ]);
    expect(buttons.map((b) => b.label)).toEqual([
      'BB2020',
      'Gouged Eye',
      'Reikland Reavers',
    ]);
  });

  it('shows the no-teams message but still renders the era button', async () => {
    const services = makeServices({
      competition: {
        id: 1,
        name: 'Major Season 24',
        type: 'cup',
        eraId: 20,
        eraName: 'BB2020',
      },
      teams: [],
    });
    const result = (await resolveCompetitionDeepdive(
      1,
      services,
    )) as unknown as {
      embeds: { description: string }[];
      components: { components: { custom_id: string }[] }[];
    };
    expect(result.embeds[0].description).toContain(
      DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
    );
    const ids = result.components.flatMap((r) =>
      r.components.map((b) => b.custom_id),
    );
    expect(ids).toEqual(['deepdive:era:20']);
  });

  it('falls back to the competition timeout message when the header lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { competitions: CompetitionsService }) =>
        resolveCompetitionDeepdive(1, services),
      () => ({
        competitions: {
          findByIdWithEra: vi.fn().mockReturnValue(new Promise(() => {})),
          listTeams: vi.fn(),
        } as unknown as CompetitionsService,
      }),
      DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the teams lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { competitions: CompetitionsService }) =>
        resolveCompetitionDeepdive(1, services),
      () => ({
        competitions: {
          findByIdWithEra: vi.fn().mockResolvedValue({
            id: 1,
            name: 'Major Season 24',
            type: 'season',
            eraId: 20,
            eraName: 'BB2020',
          }),
          listTeams: vi.fn().mockReturnValue(new Promise(() => {})),
        } as unknown as CompetitionsService,
      }),
      DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});
