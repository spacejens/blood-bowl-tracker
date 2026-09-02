import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { PositionExternalIdsService } from '../shared/position-external-ids.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { BblRawPositionPageService } from '../source/bbl-raw-position-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawRosterIndexService } from '../source/tp-raw-roster-index.service';
import { PositionAvailabilityRawRendererService } from './position-availability-raw-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

async function makeService(): Promise<{
  service: PositionAvailabilityRawRendererService;
  query: ReturnType<typeof mock<RacePositionsQueryService>>;
  positionIds: ReturnType<typeof mock<PositionExternalIdsService>>;
  raceIds: ReturnType<typeof mock<RaceExternalIdsService>>;
  bbl: ReturnType<typeof mock<BblRawPositionPageService>>;
  tp: ReturnType<typeof mock<TpRawRosterIndexService>>;
  manual: ReturnType<typeof mock<ManualRawDataService>>;
  config: ReturnType<typeof mock<RaceReviewConfigService>>;
}> {
  const query = mock<RacePositionsQueryService>();
  const positionIds = mock<PositionExternalIdsService>();
  const raceIds = mock<RaceExternalIdsService>();
  const bbl = mock<BblRawPositionPageService>();
  const tp = mock<TpRawRosterIndexService>();
  const manual = mock<ManualRawDataService>();
  const config = mock<RaceReviewConfigService>();
  config.getExternalSystemName.mockImplementation((source) =>
    source === 'bbl' ? 'BBL' : 'TP',
  );
  query.positionsFor.mockResolvedValue([]);
  positionIds.forPositions.mockResolvedValue(new Map());
  raceIds.forRace.mockResolvedValue({ bbl: [], tp: [], name: [] });
  raceIds.allForRace.mockResolvedValue([]);
  manual.availability.mockResolvedValue([]);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionAvailabilityRawRendererService,
      { provide: RacePositionsQueryService, useValue: query },
      { provide: PositionExternalIdsService, useValue: positionIds },
      { provide: RaceExternalIdsService, useValue: raceIds },
      { provide: BblRawPositionPageService, useValue: bbl },
      { provide: TpRawRosterIndexService, useValue: tp },
      { provide: ManualRawDataService, useValue: manual },
      { provide: RaceReviewConfigService, useValue: config },
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionAvailabilityRawRendererService),
    query,
    positionIds,
    raceIds,
    bbl,
    tp,
    manual,
    config,
  };
}

describe('PositionAvailabilityRawRendererService', () => {
  it('renders a BBL row showing the page name and "listed" when the page lists this race', async () => {
    const { service, query, positionIds, raceIds, bbl } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'BBL', externalId: '310-44' }]]]),
    );
    raceIds.forRace.mockResolvedValue({ bbl: ['44'], tp: [], name: [] });
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [{ bblId: '44', name: 'Dwarf' }],
      characteristics: null,
    });

    const html = await service.render(race);

    expect(bbl.positionFor).toHaveBeenCalledWith('310');
    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('Dwarf Blitzer');
    expect(html).toContain('listed');
    expect(html).not.toContain('NOT LISTED');
  });

  it('highlights a BBL row with NOT LISTED when the page does not list this race', async () => {
    const { service, query, positionIds, raceIds, bbl } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'BBL', externalId: '310-44' }]]]),
    );
    raceIds.forRace.mockResolvedValue({ bbl: ['44'], tp: [], name: [] });
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [{ bblId: '99', name: 'Orc' }],
      characteristics: null,
    });

    const html = await service.render(race);

    expect(html).toContain('NOT LISTED');
    expect(html).toContain('class="mismatch"');
  });

  it('renders "page not in the mirror" when the BBL position page cannot be read', async () => {
    const { service, query, positionIds, bbl } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'BBL', externalId: '310-44' }]]]),
    );
    bbl.positionFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('page not in the mirror');
  });

  it('skips a position with no BBL external id from the BBL sub-section', async () => {
    const { service, query, positionIds, bbl } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'TP', externalId: '999' }]]]),
    );

    const html = await service.render(race);

    expect(bbl.positionFor).not.toHaveBeenCalled();
    expect(html).not.toContain('<h5>BBL</h5>');
  });

  it('skips a BBL external id with no hyphen rather than producing a bogus typId', async () => {
    const { service, query, positionIds, bbl } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'BBL', externalId: '310' }]]]),
    );

    const html = await service.render(race);

    expect(bbl.positionFor).not.toHaveBeenCalled();
    expect(html).not.toContain('<h5>BBL</h5>');
  });

  it('lists the TP roster positions merged and deduplicated by tpPositionId across codes', async () => {
    const { service, raceIds, tp } = await makeService();
    raceIds.forRace.mockResolvedValue({
      bbl: [],
      tp: ['dwarf', 'dwarf2'],
      name: [],
    });
    tp.raceFor.mockImplementation((code: string) =>
      Promise.resolve({
        teamRaceCode: code,
        rosterName: 'Dwarf',
        rosterCount: 1,
        positions: [
          {
            tpPositionId: 100,
            name: 'Blitzer',
            isStar: false,
            characteristics: {
              move: 5,
              strength: 3,
              agility: 3,
              passing: 0,
              armour: 9,
            },
          },
          {
            tpPositionId: 200,
            name: 'Deathroller',
            isStar: true,
            characteristics: {
              move: 3,
              strength: 8,
              agility: 5,
              passing: 0,
              armour: 10,
            },
          },
        ],
      }),
    );

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    expect(html.match(/Blitzer/g)?.length).toBe(1);
    expect(html).toContain('star');
    expect(html).toContain('regular');
  });

  it('lists a manual curation entry only when its raceEras race matches one of the race external ids', async () => {
    const { service, raceIds, manual } = await makeService();
    raceIds.allForRace.mockResolvedValue([
      { systemName: 'Name', externalId: 'Dwarf: Blitzer' },
    ]);
    manual.availability.mockResolvedValue([
      {
        name: 'Blitzer',
        externalIds: [],
        raceEras: [
          {
            race: { system: 'Name', id: 'Dwarf: Blitzer' },
            era: { system: 'Name', id: 'Second Era' },
          },
        ],
      },
      {
        name: 'Lineman',
        externalIds: [],
        raceEras: [
          {
            race: { system: 'Name', id: 'Orc: Lineman' },
            era: { system: 'Name', id: 'Second Era' },
          },
        ],
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<h5>Manual curation</h5>');
    expect(html).toContain('Blitzer');
    expect(html).not.toContain('Lineman');
  });

  it('omits each sub-section entirely when that source has nothing', async () => {
    const { service, raceIds, tp } = await makeService();
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf'], name: [] });
    tp.raceFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).not.toContain('<h5>BBL</h5>');
    expect(html).not.toContain('<h5>TP</h5>');
    expect(html).not.toContain('<h5>Manual curation</h5>');
  });

  it('renders a single note when all three sources are empty', async () => {
    const { service } = await makeService();

    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No raw position-availability data for race &quot;Dwarf&quot;.</p>',
    );
  });
});
