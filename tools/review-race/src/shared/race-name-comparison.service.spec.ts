import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RaceNameComparisonService } from './race-name-comparison.service';

describe('RaceNameComparisonService', () => {
  let service: RaceNameComparisonService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RaceNameComparisonService],
    }).compile();
    service = moduleRef.get(RaceNameComparisonService);
  });

  it('strips the BBL "Team" suffix', () => {
    expect(service.normalize('Dark Elf Team')).toBe('dark elf');
  });

  it('strips the BBL "Teams" suffix', () => {
    expect(service.normalize('Wood Elf Teams')).toBe('wood elf');
  });

  it('collapses internal whitespace and trims', () => {
    expect(service.normalize('  High   Elf  ')).toBe('high elf');
  });

  it('leaves a name with no suffix alone', () => {
    expect(service.normalize('Slann')).toBe('slann');
  });

  it('does not strip "Team" from the middle of a name', () => {
    expect(service.normalize('Team Spirit Crew')).toBe('team spirit crew');
  });

  it('agrees when only the suffix and case differ', () => {
    expect(service.agree('Dark Elf Team', 'dark elf')).toBe(true);
  });

  it('disagrees on a genuinely different name', () => {
    expect(service.agree('Elven Union Team', 'Wood Elf')).toBe(false);
  });
});
