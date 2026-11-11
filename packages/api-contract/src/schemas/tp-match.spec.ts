import { describe, expect, it } from 'vitest';

import {
  ImportTpMatchSchema,
  TpBracketMatchSchema,
  TpMatchImportResultSchema,
} from './tp-match';

const bracketMatch = {
  id: 662796,
  phaseOrder: 3,
  round: 1,
  homeTeamTpId: 163386,
  awayTeamTpId: 179769,
  winner: 'away',
};

describe('TpBracketMatchSchema', () => {
  it('accepts a bracket match, with or without a winner', () => {
    expect(TpBracketMatchSchema.safeParse(bracketMatch).success).toBe(true);
    const undecided = {
      id: bracketMatch.id,
      phaseOrder: bracketMatch.phaseOrder,
      round: bracketMatch.round,
      homeTeamTpId: bracketMatch.homeTeamTpId,
      awayTeamTpId: bracketMatch.awayTeamTpId,
    };
    expect(TpBracketMatchSchema.safeParse(undecided).success).toBe(true);
  });

  it('drops fields the classifier never reads', () => {
    expect(
      TpBracketMatchSchema.parse({ ...bracketMatch, matchEvents: [1, 2] }),
    ).toEqual(bracketMatch);
  });

  it('rejects an unknown winner', () => {
    expect(
      TpBracketMatchSchema.safeParse({ ...bracketMatch, winner: 'Local' })
        .success,
    ).toBe(false);
  });
});

describe('ImportTpMatchSchema', () => {
  it('accepts raw match JSON, its bracket, competition TP id and system name', () => {
    const parsed = ImportTpMatchSchema.parse({
      match: { matchId: 662796, anything: ['raw'] },
      bracket: [bracketMatch],
      competitionTpId: 18442,
      externalSystemName: 'TP',
    });
    expect(parsed.match).toEqual({ matchId: 662796, anything: ['raw'] });
    expect(parsed.bracket).toEqual([bracketMatch]);
  });

  it('rejects an empty external system name or a missing competition', () => {
    expect(
      ImportTpMatchSchema.safeParse({
        match: {},
        bracket: [],
        competitionTpId: 1,
        externalSystemName: '',
      }).success,
    ).toBe(false);
    expect(
      ImportTpMatchSchema.safeParse({
        match: {},
        bracket: [],
        externalSystemName: 'TP',
      }).success,
    ).toBe(false);
  });
});

describe('TpMatchImportResultSchema', () => {
  const ok = { success: true, imported: 1, errors: [] };
  const full = {
    match: ok,
    participation: ok,
    starPlayerHires: ok,
    events: { ...ok, imported: 14 },
    outcome: ok,
    hiredStarPlayers: [{ playerId: 900, created: true }],
  };

  it('accepts one ImportResult per stage plus the hired star players', () => {
    expect(TpMatchImportResultSchema.safeParse(full).success).toBe(true);
  });

  it('requires the star player hires stage and the hired star players', () => {
    const { starPlayerHires: _s, ...noStage } = full;
    const { hiredStarPlayers: _h, ...noPlayers } = full;
    expect(TpMatchImportResultSchema.safeParse(noStage).success).toBe(false);
    expect(TpMatchImportResultSchema.safeParse(noPlayers).success).toBe(false);
  });
});
