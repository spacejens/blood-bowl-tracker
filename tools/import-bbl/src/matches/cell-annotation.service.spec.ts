import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CellAnnotationService } from './cell-annotation.service';

describe('CellAnnotationService', () => {
  let service: CellAnnotationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CellAnnotationService],
    }).compile();
    service = moduleRef.get(CellAnnotationService);
  });

  it.each([
    ['fans / random event', 'fans_or_random_event'],
    ['mercenary / fans / random event', 'mercenary_or_fans_or_random_event'],
    ['mercenary / star', 'mercenary_or_star'],
    ['journeyman', 'journeyman'],
    ['mercenary', 'mercenary'],
  ])('classifies %s as unidentified participant %s', (text, participant) => {
    expect(service.classify(text)).toEqual({
      kind: 'unidentified',
      participant,
    });
  });

  it.each([
    ['victim healed by apoth', 'apothecary'],
    ['victim regenerated', 'regeneration'],
  ])('classifies %s as a casualty avoided by %s', (text, avoidedBy) => {
    expect(service.classify(text)).toEqual({ kind: 'avoided', avoidedBy });
  });

  it('classifies a bare "foul" as the foul marker', () => {
    expect(service.classify('foul')).toEqual({ kind: 'foul' });
  });

  it('ignores the known shoot-out note', () => {
    expect(service.classify('Extra shoot-out TD after tied overtime')).toEqual({
      kind: 'ignored',
    });
  });

  it('matches case-insensitively', () => {
    expect(service.classify('VICTIM Healed By Apoth')).toEqual({
      kind: 'avoided',
      avoidedBy: 'apothecary',
    });
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(service.classify('   mercenary   /   star  ')).toEqual({
      kind: 'unidentified',
      participant: 'mercenary_or_star',
    });
  });

  it('reports unknown text as unrecognised', () => {
    expect(service.classify('victim eaten by the crowd')).toEqual({
      kind: 'unrecognised',
    });
  });

  it('reports empty text as unrecognised', () => {
    expect(service.classify('')).toEqual({ kind: 'unrecognised' });
  });

  it('does not treat a vocabulary entry embedded in prose as a match', () => {
    expect(service.classify('foul by someone')).toEqual({
      kind: 'unrecognised',
    });
  });

  it('does not resolve an inherited Object property as a vocabulary entry', () => {
    expect(service.classify('constructor')).toEqual({ kind: 'unrecognised' });
  });
});
