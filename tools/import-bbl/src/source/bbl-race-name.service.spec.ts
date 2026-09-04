import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BblRaceNameService } from './bbl-race-name.service';

describe('BblRaceNameService', () => {
  let service: BblRaceNameService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BblRaceNameService],
    }).compile();
    service = moduleRef.get(BblRaceNameService);
  });

  it('strips the singular team-page suffix', () => {
    expect(service.canonical('Underworld Denizens Team')).toBe(
      'Underworld Denizens',
    );
  });

  it('strips the plural team-page suffix', () => {
    expect(service.canonical('Wood Elf Teams')).toBe('Wood Elf');
  });

  it('leaves a race name without the suffix unchanged', () => {
    expect(service.canonical('Slann')).toBe('Slann');
    expect(service.canonical('College of Fire')).toBe('College of Fire');
    expect(service.canonical('SL - Chaos Halflings')).toBe(
      'SL - Chaos Halflings',
    );
  });

  it('only strips the suffix at the end of the name', () => {
    expect(service.canonical('Team Player Squad')).toBe('Team Player Squad');
  });
});
