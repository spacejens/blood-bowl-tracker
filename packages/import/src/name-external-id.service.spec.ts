import { describe, expect, it } from 'vitest';

import { NameExternalIdService } from './name-external-id.service';

describe('NameExternalIdService', () => {
  const service = new NameExternalIdService();

  it('returns the bare name for coach/era/league/competition/rules-set/team/race/star', () => {
    expect(service.forCoach('Ada Lovelace')).toBe('Ada Lovelace');
    expect(service.forEra('Season 12')).toBe('Season 12');
    expect(service.forLeague('My League')).toBe('My League');
    expect(service.forCompetition('Spike Cup')).toBe('Spike Cup');
    expect(service.forRulesSet('CRP')).toBe('CRP');
    expect(service.forTeam('The Reikland Reavers')).toBe(
      'The Reikland Reavers',
    );
    expect(service.forRace('Necromantic Horror')).toBe('Necromantic Horror');
    expect(service.forStarPosition('Griff Oberwald')).toBe('Griff Oberwald');
  });

  it('scopes a regular position id by race name', () => {
    expect(service.forPosition('Necromantic Horror', 'Zombie')).toBe(
      'Necromantic Horror: Zombie',
    );
  });
});
