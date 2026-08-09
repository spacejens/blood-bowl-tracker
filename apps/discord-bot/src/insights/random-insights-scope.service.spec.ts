import {
  CompetitionsService,
  ErasService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { MatchCategoryLabelService } from './facts/match-category-label.service';
import { RandomInsightsScopeService } from './random-insights-scope.service';
import { RandomSourceService } from './random-source.service';

const ONGOING_ERA = {
  id: 1,
  name: 'BB2020',
  leagueName: 'BBL',
  startDate: '2021-09-01',
  endDate: null,
};
const FINISHED_ERA = {
  id: 2,
  name: 'BB2016',
  leagueName: 'BBL',
  startDate: '2017-01-01',
  endDate: '2020-12-31',
};

describe('RandomInsightsScopeService', () => {
  let config: MockProxy<DiscordBotConfigService>;
  let random: MockProxy<RandomSourceService>;
  let eras: MockProxy<ErasService>;
  let competitions: MockProxy<CompetitionsService>;
  let categoryLabel: MockProxy<MatchCategoryLabelService>;
  let service: RandomInsightsScopeService;

  beforeEach(async () => {
    config = mock<DiscordBotConfigService>();
    config.getRandomInsightsFilterProbability.mockReturnValue(50);
    config.getRandomInsightsFilterCurrentEraProbability.mockReturnValue(75);
    random = mock<RandomSourceService>();
    eras = mock<ErasService>();
    eras.listErasWithLeague.mockResolvedValue([ONGOING_ERA, FINISHED_ERA]);
    competitions = mock<CompetitionsService>();
    competitions.listAllWithEraId.mockResolvedValue([
      { id: 10, name: 'Season 5', eraId: 1 },
      { id: 11, name: 'Season 1', eraId: 2 },
    ]);
    categoryLabel = mock<MatchCategoryLabelService>();
    categoryLabel.label.mockReturnValue('Label for the category');

    const moduleRef = await Test.createTestingModule({
      providers: [
        RandomInsightsScopeService,
        { provide: DiscordBotConfigService, useValue: config },
        { provide: RandomSourceService, useValue: random },
        { provide: ErasService, useValue: eras },
        { provide: CompetitionsService, useValue: competitions },
        { provide: MatchCategoryLabelService, useValue: categoryLabel },
      ],
    }).compile();
    service = moduleRef.get(RandomInsightsScopeService);
  });

  /**
   * Drive the percent rolls in the order the service makes them: first
   * "filter at all?", then "ongoing eras only?".
   */
  function rolls(...results: boolean[]): void {
    let index = 0;
    random.rollPercent.mockImplementation(() => results[index++] ?? false);
  }

  /**
   * Drive the successive `pick` calls: the nth call returns the element at
   * `indexes[n]` of whatever list the service offers.
   */
  function picks(...indexes: number[]): void {
    let call = 0;
    random.pick.mockImplementation(
      (items: readonly unknown[]) => items[indexes[call++] ?? 0],
    );
  }

  it('returns an unfiltered scope when the filter roll misses', async () => {
    rolls(false);
    expect(await service.pickScope()).toEqual({});
    expect(random.rollPercent).toHaveBeenCalledWith(50);
    expect(eras.listErasWithLeague).not.toHaveBeenCalled();
  });

  it('scopes to an ongoing era when the current-era roll hits', async () => {
    rolls(true, true);
    // dimension pick -> index 0 = 'era'; era pick -> index 0 of the ongoing-only list.
    picks(0, 0);
    expect(await service.pickScope()).toEqual({
      era: { id: 1, name: 'BB2020' },
    });
    expect(eras.listErasWithLeague).toHaveBeenCalledWith({});
    expect(random.rollPercent).toHaveBeenCalledWith(75);
  });

  it('scopes to any era when the current-era roll misses', async () => {
    rolls(true, false);
    // era pick -> index 1 = the finished era, reachable only from the full list.
    picks(0, 1);
    expect(await service.pickScope()).toEqual({
      era: { id: 2, name: 'BB2016' },
    });
  });

  it('falls back to all eras when none are ongoing', async () => {
    eras.listErasWithLeague.mockResolvedValue([FINISHED_ERA]);
    rolls(true, true);
    picks(0, 0);
    expect(await service.pickScope()).toEqual({
      era: { id: 2, name: 'BB2016' },
    });
  });

  it('scopes to a competition in an ongoing era when the current-era roll hits', async () => {
    rolls(true, true);
    // dimension pick -> index 1 = 'competition'; competition pick -> index 0 of
    // the candidates left after filtering to the ongoing era.
    picks(1, 0);
    expect(await service.pickScope()).toEqual({
      competition: { id: 10, name: 'Season 5' },
    });
    expect(competitions.listAllWithEraId).toHaveBeenCalled();
  });

  it('scopes to any competition when the current-era roll misses', async () => {
    rolls(true, false);
    // competition pick -> index 1, which belongs to the finished era.
    picks(1, 1);
    expect(await service.pickScope()).toEqual({
      competition: { id: 11, name: 'Season 1' },
    });
  });

  it('scopes to a match category without consulting eras', async () => {
    rolls(true);
    // dimension pick -> index 2 = 'match-category'; category pick -> 'normal'.
    picks(2, 0);
    expect(await service.pickScope()).toEqual({
      matchCategory: { value: 'normal', label: 'Label for the category' },
    });
    expect(categoryLabel.label).toHaveBeenCalledWith('normal');
    expect(eras.listErasWithLeague).not.toHaveBeenCalled();
    expect(random.rollPercent).toHaveBeenCalledTimes(1);
  });

  it('returns an unfiltered scope when there are no eras at all', async () => {
    eras.listErasWithLeague.mockResolvedValue([]);
    rolls(true, true);
    picks(0, 0);
    expect(await service.pickScope()).toEqual({});
  });

  it('returns an unfiltered scope when no competition matches the candidate eras', async () => {
    competitions.listAllWithEraId.mockResolvedValue([]);
    rolls(true, true);
    picks(1, 0);
    expect(await service.pickScope()).toEqual({});
  });
});
