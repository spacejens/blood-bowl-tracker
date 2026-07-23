import { describe, expect, it } from 'vitest';

import { NameExternalIdService } from './name-external-id.service';

describe('NameExternalIdService', () => {
  const service = new NameExternalIdService();

  it('returns the bare name for a coach', () => {
    expect(service.forCoach('Ada Lovelace')).toBe('Ada Lovelace');
  });

  it('returns the bare name for an era', () => {
    expect(service.forEra('Season 12')).toBe('Season 12');
  });

  it('returns the bare name for a league', () => {
    expect(service.forLeague('My League')).toBe('My League');
  });

  it('returns the bare name for a competition', () => {
    expect(service.forCompetition('Spike Cup')).toBe('Spike Cup');
  });

  it('returns the bare name for a rules set', () => {
    expect(service.forRulesSet('CRP')).toBe('CRP');
  });

  it('returns the bare name for a team', () => {
    expect(service.forTeam('The Reikland Reavers')).toBe(
      'The Reikland Reavers',
    );
  });

  it('returns the bare name for a race', () => {
    expect(service.forRace('Necromantic Horror')).toBe('Necromantic Horror');
  });

  it('returns the bare name for a star position', () => {
    expect(service.forStarPosition('Griff Oberwald')).toBe('Griff Oberwald');
  });

  it('scopes a regular position id by race name', () => {
    expect(service.forPosition('Necromantic Horror', 'Zombie')).toBe(
      'Necromantic Horror: Zombie',
    );
  });
});
