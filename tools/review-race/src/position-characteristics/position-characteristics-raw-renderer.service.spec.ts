import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblPositionTypIdsService } from '../shared/bbl-position-typ-ids.service';
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

describe('PositionCharacteristicsRawRendererService', () => {
  let service: PositionCharacteristicsRawRendererService;
  let query: ReturnType<typeof mock<RacePositionsQueryService>>;
  let positionIds: ReturnType<typeof mock<PositionExternalIdsService>>;
  let raceIds: ReturnType<typeof mock<RaceExternalIdsService>>;
  let bbl: ReturnType<typeof mock<BblRawPositionPageService>>;
  let tp: ReturnType<typeof mock<TpRawRosterIndexService>>;
  let manual: ReturnType<typeof mock<ManualRawDataService>>;
  let typIds: ReturnType<typeof mock<BblPositionTypIdsService>>;

  beforeEach(async () => {
    query = mock<RacePositionsQueryService>();
    positionIds = mock<PositionExternalIdsService>();
    raceIds = mock<RaceExternalIdsService>();
    bbl = mock<BblRawPositionPageService>();
    tp = mock<TpRawRosterIndexService>();
    manual = mock<ManualRawDataService>();
    typIds = mock<BblPositionTypIdsService>();
    query.positionsFor.mockResolvedValue([]);
    positionIds.forPositions.mockResolvedValue(new Map());
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: [], name: [] });
    manual.characteristics.mockResolvedValue([]);
    typIds.forRace.mockResolvedValue(new Map());
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionCharacteristicsRawRendererService,
        { provide: RacePositionsQueryService, useValue: query },
        { provide: PositionExternalIdsService, useValue: positionIds },
        { provide: RaceExternalIdsService, useValue: raceIds },
        { provide: BblRawPositionPageService, useValue: bbl },
        { provide: TpRawRosterIndexService, useValue: tp },
        { provide: ManualRawDataService, useValue: manual },
        { provide: BblPositionTypIdsService, useValue: typIds },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(PositionCharacteristicsRawRendererService);
  });

  it('lists each stored position\'s BBL characteristics, with — for a "-" passing cell', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [],
      characteristics: {
        move: '6',
        strength: '3',
        agility: '3',
        passing: null,
        armour: '8',
      },
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain(
      '<td>Blitzer</td><td>310</td><td>6</td><td>3</td><td>3</td><td>—</td><td>8</td>',
    );
  });

  it('renders BBL\'s "+" notation verbatim in the raw table', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [],
      characteristics: {
        move: '6',
        strength: '3',
        agility: '3+',
        passing: '4+',
        armour: '9+',
      },
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain(
      '<td>Blitzer</td><td>310</td><td>6</td><td>3</td><td>3+</td><td>4+</td><td>9+</td>',
    );
  });

  it('renders "no characteristics table on the page" when the page has none', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [],
      characteristics: null,
    });

    const html = await service.render(race);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Blitzer</td><td>310</td><td>no characteristics table on the page</td><td>—</td><td>—</td><td>—</td><td>—</td>',
    );
  });

  it('renders "page not in the mirror" when the BBL position page cannot be read', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Blitzer</td><td>310</td><td>page not in the mirror</td><td>—</td><td>—</td><td>—</td><td>—</td>',
    );
  });

  it('lists TP roster characteristics deduplicated by tpPositionId, excluding star players', async () => {
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
    expect(html).not.toContain('Deathroller');
    expect(html).toContain(
      '<td>Blitzer</td><td>6</td><td>3</td><td>3</td><td>0</td><td>8</td>',
    );
  });

  it("lists a manual curation entry whose Name-system position id matches the race's positions", async () => {
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
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
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
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
    const html = await service.render(race);

    expect(html).not.toContain('<h5>BBL</h5>');
    expect(html).not.toContain('<h5>TP</h5>');
    expect(html).not.toContain('<h5>Manual curation</h5>');
    expect(html).toBe(
      '<p class="note">No raw position-characteristics data for race &quot;Dwarf&quot;.</p>',
    );
  });
});
