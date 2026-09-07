import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblPositionTypIdsService } from '../shared/bbl-position-typ-ids.service';
import { ManualEntryMatcherService } from '../shared/manual-entry-matcher.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
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

describe('PositionAvailabilityRawRendererService', () => {
  let service: PositionAvailabilityRawRendererService;
  let raceIds: ReturnType<typeof mock<RaceExternalIdsService>>;
  let bbl: ReturnType<typeof mock<BblRawPositionPageService>>;
  let tp: ReturnType<typeof mock<TpRawRosterIndexService>>;
  let manual: ReturnType<typeof mock<ManualRawDataService>>;
  let typIds: ReturnType<typeof mock<BblPositionTypIdsService>>;

  beforeEach(async () => {
    raceIds = mock<RaceExternalIdsService>();
    bbl = mock<BblRawPositionPageService>();
    tp = mock<TpRawRosterIndexService>();
    manual = mock<ManualRawDataService>();
    typIds = mock<BblPositionTypIdsService>();
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: [], name: [] });
    raceIds.allForRace.mockResolvedValue([]);
    manual.availability.mockResolvedValue([]);
    typIds.forRace.mockResolvedValue(new Map());
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionAvailabilityRawRendererService,
        { provide: RaceExternalIdsService, useValue: raceIds },
        { provide: BblRawPositionPageService, useValue: bbl },
        { provide: TpRawRosterIndexService, useValue: tp },
        { provide: ManualRawDataService, useValue: manual },
        { provide: BblPositionTypIdsService, useValue: typIds },
        ManualEntryMatcherService,
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(PositionAvailabilityRawRendererService);
  });

  it('renders a BBL row showing the page name and "listed" when the page lists this race', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
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
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
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
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('page not in the mirror');
  });

  it('omits the BBL sub-section when the race has no BBL typIds', async () => {
    const html = await service.render(race);

    expect(bbl.positionFor).not.toHaveBeenCalled();
    expect(html).not.toContain('<h5>BBL</h5>');
  });

  it('lists the TP roster positions merged and deduplicated by tpPositionId across codes, excluding star players', async () => {
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
    expect(html).not.toContain('Deathroller');
  });

  it('omits the TP sub-section when every TP position is a star player', async () => {
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf'], name: [] });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf',
      rosterName: 'Dwarf',
      rosterCount: 1,
      positions: [
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
    });

    const html = await service.render(race);

    expect(html).not.toContain('<h5>TP</h5>');
  });

  it('lists a manual curation entry only when its raceEras race matches one of the race external ids', async () => {
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
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf'], name: [] });
    tp.raceFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).not.toContain('<h5>BBL</h5>');
    expect(html).not.toContain('<h5>TP</h5>');
    expect(html).not.toContain('<h5>Manual curation</h5>');
  });

  it('renders a single note when all three sources are empty', async () => {
    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No raw position-availability data for race &quot;Dwarf&quot;.</p>',
    );
  });
});
