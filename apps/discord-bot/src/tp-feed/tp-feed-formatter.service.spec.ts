import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TeamInfo } from './tp-feed-event';
import { TpFeedFormatterService } from './tp-feed-formatter.service';

const home: TeamInfo = {
  name: 'EVERVAIN EGRETS',
  race: 'High Elf',
  coach: 'Patrick M',
};
const away: TeamInfo = {
  name: 'ROCKET FROM THE TOMBS',
  race: 'Tomb Kings',
  coach: 'Andreas Gunnarsson',
};

describe('TpFeedFormatterService', () => {
  let service: TpFeedFormatterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpFeedFormatterService],
    }).compile();
    service = moduleRef.get(TpFeedFormatterService);
  });

  it('formats a match start', () => {
    expect(
      service.format({
        kind: 'match-start',
        home,
        away,
        link: 'https://tp/m/1',
      }),
    ).toBe(
      'Match started: EVERVAIN EGRETS (High Elf) vs ROCKET FROM THE TOMBS (Tomb Kings) — https://tp/m/1',
    );
  });

  it('formats a drawn match end', () => {
    expect(
      service.format({
        kind: 'match-end',
        home,
        away,
        homeScore: 1,
        awayScore: 1,
        outcome: 'draw',
        winnerName: null,
        link: 'https://tp/m/1',
      }),
    ).toBe(
      'Match ended in a draw: EVERVAIN EGRETS 1 - 1 ROCKET FROM THE TOMBS — https://tp/m/1',
    );
  });

  it('formats a match end won by the home team', () => {
    expect(
      service.format({
        kind: 'match-end',
        home,
        away,
        homeScore: 3,
        awayScore: 1,
        outcome: 'win',
        winnerName: 'Evervain Egrets',
        link: 'https://tp/m/1',
      }),
    ).toBe(
      'Match ended: Evervain Egrets won 3-1 vs ROCKET FROM THE TOMBS — https://tp/m/1',
    );
  });

  it('formats a match end won by the away team', () => {
    expect(
      service.format({
        kind: 'match-end',
        home,
        away,
        homeScore: 0,
        awayScore: 2,
        outcome: 'win',
        winnerName: 'Rocket From The Tombs',
        link: 'https://tp/m/1',
      }),
    ).toBe(
      'Match ended: Rocket From The Tombs won 2-0 vs EVERVAIN EGRETS — https://tp/m/1',
    );
  });

  it('falls back to the higher-scoring team name when a win has no winner name', () => {
    expect(
      service.format({
        kind: 'match-end',
        home,
        away,
        homeScore: 2,
        awayScore: 0,
        outcome: 'win',
        winnerName: null,
        link: 'https://tp/m/1',
      }),
    ).toBe(
      'Match ended: EVERVAIN EGRETS won 2-0 vs ROCKET FROM THE TOMBS — https://tp/m/1',
    );
  });

  it('formats a new skill/characteristic', () => {
    expect(
      service.format({
        kind: 'new-skill-or-characteristic',
        playerNumber: '8',
        playerName: 'Phothara The Crimson',
        position: 'Tomb Guardian',
        teamName: 'Rocket From The Tombs',
        description: 'Random Primary Guard ★8',
        link: 'https://tp/r/1',
      }),
    ).toBe(
      'New skill/characteristic: #8 Phothara The Crimson (Tomb Guardian, Rocket From The Tombs) — Random Primary Guard ★8 — https://tp/r/1',
    );
  });

  it('formats a hire', () => {
    expect(
      service.format({
        kind: 'hired',
        playerNumber: '3',
        playerName: 'Ragnfred Brownlock',
        position: 'Halfling Hefty',
        teamName: "Satan's Little Helpers",
        link: 'https://tp/r/1',
      }),
    ).toBe(
      "Hired: #3 Ragnfred Brownlock (Halfling Hefty) for Satan's Little Helpers — https://tp/r/1",
    );
  });

  it('formats a firing', () => {
    expect(
      service.format({
        kind: 'fired',
        playerNumber: '10',
        playerName: 'Helmut Cool',
        position: 'Imperial Thrower',
        teamName: 'Bamberger Billy-Böbs',
        link: 'https://tp/r/1',
      }),
    ).toBe(
      'Fired: #10 Helmut Cool (Imperial Thrower) from Bamberger Billy-Böbs — https://tp/r/1',
    );
  });
});
