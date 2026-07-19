import type { CoachesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { resolveCoachDeepdive } from './coach-deepdive';

function makeServices(options: {
  coach?: { id: number; name: string };
  span?: { start: string; end: string };
  topTeams?: { name: string; count: number }[];
}): { coaches: CoachesService } {
  const coaches = {
    findById: vi.fn().mockResolvedValue(options.coach),
    getCareerSpan: vi.fn().mockResolvedValue(options.span),
    getTopTeamsByMatchesPlayed: vi
      .fn()
      .mockResolvedValue(options.topTeams ?? []),
  } as unknown as CoachesService;
  return { coaches };
}

describe('resolveCoachDeepdive', () => {
  it('returns the not-found message when the coach does not exist', async () => {
    const result = await resolveCoachDeepdive(
      999,
      makeServices({ coach: undefined }),
    );
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
  });

  it('renders the career span and top-teams list', async () => {
    const services = makeServices({
      coach: { id: 1, name: 'Roze Madder' },
      span: { start: '2021-09-01', end: '2023-06-10' },
      topTeams: [
        { name: 'Reikland Reavers', count: 12 },
        { name: 'Gouged Eye', count: 5 },
      ],
    });
    const result = await resolveCoachDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Roze Madder',
          description: [
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top teams:',
            '1. Reikland Reavers — 12',
            '2. Gouged Eye — 5',
          ].join('\n'),
        },
      ],
    });
  });

  it('renders a tie group at the cutoff with a truncation note', async () => {
    const topTeams = [
      { name: 'A', count: 9 },
      { name: 'B', count: 9 },
      { name: 'C', count: 9 },
      { name: 'D', count: 9 },
      { name: 'E', count: 9 },
      { name: 'F', count: 9 },
      { name: 'G', count: 9 },
      { name: 'H', count: 9 },
      { name: 'I', count: 9 },
      { name: 'J', count: 9 },
    ];
    const services = makeServices({
      coach: { id: 1, name: 'Roze Madder' },
      span: { start: '2021-09-01', end: '2023-06-10' },
      topTeams,
    });
    const result = (await resolveCoachDeepdive(1, services)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    // All ten fetched rows tie at rank 1; the resolver caps rendered entries at
    // MAX_LEADERBOARD_ENTRIES (10), so all ten show and no remainder is noted.
    expect(lines).toContain('1. A — 9');
    expect(lines).toContain('1. J — 9');
    expect(lines.every((l) => !l.startsWith('…and'))).toBe(true);
  });

  it('shows the no-matches message and skips the top-teams section', async () => {
    const services = makeServices({
      coach: { id: 1, name: 'Roze Madder' },
      span: undefined,
    });
    const result = await resolveCoachDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Roze Madder',
          description: DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
        },
      ],
    });
    // Top-teams lookup must not run for a coach with no matches.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(services.coaches.getTopTeamsByMatchesPlayed).not.toHaveBeenCalled();
  });

  it('falls back to the coach timeout message when the coach lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { coaches: CoachesService }) =>
        resolveCoachDeepdive(1, services),
      () => ({
        coaches: {
          findById: vi.fn().mockReturnValue(new Promise(() => {})),
          getCareerSpan: vi.fn(),
          getTopTeamsByMatchesPlayed: vi.fn(),
        } as unknown as CoachesService,
      }),
      DEEPDIVE_COACH_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { coaches: CoachesService }) =>
        resolveCoachDeepdive(1, services),
      () => ({
        coaches: {
          findById: vi.fn().mockResolvedValue({ id: 1, name: 'Roze Madder' }),
          getCareerSpan: vi.fn().mockReturnValue(new Promise(() => {})),
          getTopTeamsByMatchesPlayed: vi.fn(),
        } as unknown as CoachesService,
      }),
      DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the top-teams lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { coaches: CoachesService }) =>
        resolveCoachDeepdive(1, services),
      () => ({
        coaches: {
          findById: vi.fn().mockResolvedValue({ id: 1, name: 'Roze Madder' }),
          getCareerSpan: vi
            .fn()
            .mockResolvedValue({ start: '2021-09-01', end: '2023-06-10' }),
          getTopTeamsByMatchesPlayed: vi
            .fn()
            .mockReturnValue(new Promise(() => {})),
        } as unknown as CoachesService,
      }),
      DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});
