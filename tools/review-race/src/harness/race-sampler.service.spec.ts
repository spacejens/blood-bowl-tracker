import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import type { RaceStratifier } from '../shared/race-stratifier';
import { RACE_STRATIFIERS } from '../shared/race-stratifier';
import type { ReviewRace } from '../shared/review.types';
import { RaceLookupService } from './race-lookup.service';
import { RaceSamplerService } from './race-sampler.service';

function reviewRace(overrides: Partial<ReviewRace> = {}): ReviewRace {
  return {
    raceId: 7,
    raceName: 'Dwarf',
    ...overrides,
  };
}

async function makeService(options: {
  stratifier?: MockProxy<RaceStratifier>;
  lookup?: MockProxy<RaceLookupService>;
  config?: MockProxy<RaceReviewConfigService>;
}): Promise<RaceSamplerService> {
  const stratifier =
    options.stratifier ??
    (() => {
      const created = mock<RaceStratifier>();
      created.listStrata.mockReturnValue([]);
      return created;
    })();
  const lookup = options.lookup ?? mock<RaceLookupService>();
  const config = options.config ?? mock<RaceReviewConfigService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceSamplerService,
      { provide: RACE_STRATIFIERS, useValue: [stratifier] },
      { provide: RaceLookupService, useValue: lookup },
      { provide: RaceReviewConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(RaceSamplerService);
}

describe('RaceSamplerService', () => {
  it('samples every stratum for every source it declares', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl', 'tp'] },
    ]);
    stratifier.sampleStratum.mockImplementation(({ source }) =>
      Promise.resolve([
        reviewRace({
          raceId: source === 'bbl' ? 7 : 8,
          raceName: source === 'bbl' ? 'Dwarf' : 'Human',
        }),
      ]),
    );
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: races, gaps } = await service.sample();

    expect(races.map((race) => race.raceId)).toEqual([7, 8]);
    expect(races[0].selectedFor).toEqual(['Random sample']);
    expect(gaps).toEqual([]);
    expect(stratifier.sampleStratum).toHaveBeenCalledWith({
      source: 'bbl',
      stratumId: 'random',
      limit: 3,
    });
  });

  it('collapses a race returned by the same stratum under two sources into one entry', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([
      {
        id: 'source-coverage',
        label: 'Source coverage',
        sources: ['bbl', 'tp'],
      },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewRace()]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: races } = await service.sample();

    expect(races).toHaveLength(1);
    expect(races[0].selectedFor).toEqual(['Source coverage']);
  });

  it('adds a second label when a race is picked by two different strata', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
      { id: 'name-mismatch', label: 'Name mismatch', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewRace()]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: races } = await service.sample();

    expect(races).toHaveLength(1);
    expect(races[0].selectedFor).toEqual(['Random sample', 'Name mismatch']);
  });

  it('records a gap for a stratum that produced nothing for a source', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      { source: 'bbl', reason: 'No race found for stratum "Random sample"' },
    ]);
  });

  it('adds override races with the reason "override"', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([]);
    const lookup = mock<RaceLookupService>();
    lookup.findByExternalIds.mockResolvedValue([reviewRace()]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockImplementation((source) =>
      source === 'bbl' ? ['5'] : [],
    );
    const service = await makeService({ stratifier, lookup, config });

    const { items: races } = await service.sample();

    expect(races[0].selectedFor).toEqual(['override']);
  });

  it('records a gap naming the source and requested ids when fewer overrides resolve than requested', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([]);
    const lookup = mock<RaceLookupService>();
    lookup.findByExternalIds.mockResolvedValue([]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockImplementation((source) =>
      source === 'tp' ? ['NoSuchRace'] : [],
    );
    const service = await makeService({ stratifier, lookup, config });

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      {
        source: 'tp',
        reason:
          'Only 0 of 1 override race(s) were found in the database: NoSuchRace',
      },
    ]);
  });

  it('sorts the result by race name, then race id', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([
      reviewRace({ raceId: 5, raceName: 'Beta' }),
      reviewRace({ raceId: 2, raceName: 'Beta' }),
      reviewRace({ raceId: 9, raceName: 'Alpha' }),
    ]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: races } = await service.sample();

    expect(races.map((race) => [race.raceName, race.raceId])).toEqual([
      ['Alpha', 9],
      ['Beta', 2],
      ['Beta', 5],
    ]);
  });

  it('passes getRacesPerStratum() through as each request limit', async () => {
    const stratifier = mock<RaceStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewRace()]);
    const config = mock<RaceReviewConfigService>();
    config.getRacesPerStratum.mockReturnValue(7);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    await service.sample();

    expect(stratifier.sampleStratum).toHaveBeenCalledWith({
      source: 'bbl',
      stratumId: 'random',
      limit: 7,
    });
  });
});
