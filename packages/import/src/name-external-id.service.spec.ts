import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NameExternalIdService } from './name-external-id.service';

describe('NameExternalIdService', () => {
  let service: NameExternalIdService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [NameExternalIdService],
    }).compile();
    service = moduleRef.get(NameExternalIdService);
  });

  it('returns the bare name for a coach', () => {
    expect(service.forCoach('Ada Lovelace')).toBe('Ada Lovelace');
  });

  it('returns the bare name for an era', () => {
    expect(service.forEra('Season 12')).toBe('Season 12');
  });

  it('returns the bare name for a league', () => {
    expect(service.forLeague('My League')).toBe('My League');
  });

  // Competitions deliberately have no Name id: a shared Name external id makes
  // distinct same-named competitions dedupe onto one row via
  // resolveExistingByExternalIds (issue #285), and no competition is ever
  // imported from two source systems, so there is nothing to dedupe across.
  it('exposes no competition method', () => {
    expect('forCompetition' in service).toBe(false);
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
