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
import { PositionCharacteristicsRawRendererService } from './position-characteristics-raw-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

async function makeService(): Promise<{
  service: PositionCharacteristicsRawRendererService;
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
  manual.characteristics.mockResolvedValue([]);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionCharacteristicsRawRendererService,
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
    service: moduleRef.get(PositionCharacteristicsRawRendererService),
    query,
    positionIds,
    raceIds,
    bbl,
    tp,
    manual,
    config,
  };
}

describe('PositionCharacteristicsRawRendererService', () => {
  it('lists each stored position\'s BBL characteristics, with — for a "-" passing cell', async () => {
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
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [],
      characteristics: {
        move: 6,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      },
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain(
      '<td>Blitzer</td><td>6</td><td>3</td><td>3</td><td>—</td><td>8</td>',
    );
  });

  it('renders "no characteristics table on the page" when the page has none', async () => {
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
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [],
      characteristics: null,
    });

    const html = await service.render(race);

    expect(html).toContain('no characteristics table on the page');
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

  it('lists TP roster characteristics deduplicated by tpPositionId', async () => {
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
              move: 6,
              strength: 3,
              agility: 3,
              passing: 0,
              armour: 8,
            },
          },
        ],
      }),
    );

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    expect(html.match(/Blitzer/g)?.length).toBe(1);
    expect(html).toContain(
      '<td>Blitzer</td><td>6</td><td>3</td><td>3</td><td>0</td><td>8</td>',
    );
  });

  it("lists a manual curation entry whose Name-system position id matches the race's positions", async () => {
    const { service, query, positionIds, manual } = await makeService();
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
      new Map([[1, [{ systemName: 'Name', externalId: 'Dwarf: Blitzer' }]]]),
    );
    manual.characteristics.mockResolvedValue([
      {
        position: { system: 'Name', id: 'Dwarf: Blitzer' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 6,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      },
      {
        position: { system: 'Name', id: 'Orc: Lineman' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 6,
        strength: 3,
        agility: 2,
        passing: null,
        armour: 9,
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<h5>Manual curation</h5>');
    expect(html).toContain(
      '<td>Blitzer</td><td>BB2020</td><td>6</td><td>3</td><td>3</td><td>—</td><td>8</td>',
    );
    expect(html).not.toContain('Orc: Lineman');
  });

  it('excludes a curated entry for a position of a different race', async () => {
    const { service, query, positionIds, manual } = await makeService();
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
      new Map([[1, [{ systemName: 'Name', externalId: 'Dwarf: Blitzer' }]]]),
    );
    manual.characteristics.mockResolvedValue([
      {
        position: { system: 'Name', id: 'Orc: Lineman' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 6,
        strength: 3,
        agility: 2,
        passing: null,
        armour: 9,
      },
    ]);

    const html = await service.render(race);

    expect(html).not.toContain('<h5>Manual curation</h5>');
  });

  it('omits empty sub-sections, and renders one note when all are empty', async () => {
    const { service } = await makeService();

    const html = await service.render(race);

    expect(html).not.toContain('<h5>BBL</h5>');
    expect(html).not.toContain('<h5>TP</h5>');
    expect(html).not.toContain('<h5>Manual curation</h5>');
    expect(html).toBe(
      '<p class="note">No raw position-characteristics data for race &quot;Dwarf&quot;.</p>',
    );
  });
});
