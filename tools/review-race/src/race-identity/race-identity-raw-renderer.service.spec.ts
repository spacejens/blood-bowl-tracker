import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ManualEntryMatcherService } from '../shared/manual-entry-matcher.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RaceNameComparisonService } from '../shared/race-name-comparison.service';
import type { SampledRace } from '../shared/review.types';
import { BblRawRaceIndexService } from '../source/bbl-raw-race-index.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawRosterIndexService } from '../source/tp-raw-roster-index.service';
import { RaceIdentityRawRendererService } from './race-identity-raw-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('RaceIdentityRawRendererService', () => {
  let service: RaceIdentityRawRendererService;
  let externalIds: ReturnType<typeof mock<RaceExternalIdsService>>;
  let bbl: ReturnType<typeof mock<BblRawRaceIndexService>>;
  let tp: ReturnType<typeof mock<TpRawRosterIndexService>>;
  let manual: ReturnType<typeof mock<ManualRawDataService>>;

  beforeEach(async () => {
    externalIds = mock<RaceExternalIdsService>();
    bbl = mock<BblRawRaceIndexService>();
    tp = mock<TpRawRosterIndexService>();
    manual = mock<ManualRawDataService>();
    externalIds.forRace.mockResolvedValue({ bbl: [], tp: [], name: [] });
    externalIds.allForRace.mockResolvedValue([]);
    manual.races.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RaceIdentityRawRendererService,
        { provide: RaceExternalIdsService, useValue: externalIds },
        { provide: BblRawRaceIndexService, useValue: bbl },
        { provide: TpRawRosterIndexService, useValue: tp },
        { provide: ManualRawDataService, useValue: manual },
        RaceNameComparisonService,
        ManualEntryMatcherService,
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(RaceIdentityRawRendererService);
  });

  it('renders a BBL sub-heading and the race-list name, team-page name and count', async () => {
    externalIds.forRace.mockResolvedValue({ bbl: ['5'], tp: [], name: [] });
    bbl.raceFor.mockResolvedValue({
      bblId: '5',
      listName: 'Dwarf Team',
      teamPageName: 'Dwarf Team',
      teamPageCount: 12,
      teamCodes: ['ABC'],
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('Dwarf Team');
    expect(html).toContain('12');
  });

  it('omits the BBL sub-heading entirely when forRace reports no BBL id', async () => {
    const html = await service.render(race);

    expect(html).not.toContain('<h5>BBL</h5>');
  });

  it('renders the BBL id with an explanatory note when the id exists but raceFor returns null', async () => {
    externalIds.forRace.mockResolvedValue({ bbl: ['5'], tp: [], name: [] });
    bbl.raceFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('5');
    expect(html).toContain('not in the mirror');
  });

  it('falls back to em-dashes for a BBL row when listName and teamPageName are both absent', async () => {
    externalIds.forRace.mockResolvedValue({ bbl: ['5'], tp: [], name: [] });
    bbl.raceFor.mockResolvedValue({
      bblId: '5',
      listName: null,
      teamPageName: null,
      teamPageCount: 0,
      teamCodes: [],
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html.match(/<td>—<\/td>/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('appends an "and N more" note to team codes truncated below the team page count', async () => {
    externalIds.forRace.mockResolvedValue({ bbl: ['5'], tp: [], name: [] });
    bbl.raceFor.mockResolvedValue({
      bblId: '5',
      listName: 'Dwarf Team',
      teamPageName: 'Dwarf Team',
      teamPageCount: 12,
      teamCodes: ['ABC', 'DEF'],
    });

    const html = await service.render(race);

    expect(html).toContain('ABC, DEF (and 10 more)');
  });

  it('shows team codes with no "and N more" note when nothing was truncated', async () => {
    externalIds.forRace.mockResolvedValue({ bbl: ['5'], tp: [], name: [] });
    bbl.raceFor.mockResolvedValue({
      bblId: '5',
      listName: 'Dwarf Team',
      teamPageName: 'Dwarf Team',
      teamPageCount: 2,
      teamCodes: ['ABC', 'DEF'],
    });

    const html = await service.render(race);

    expect(html).toContain('ABC, DEF');
    expect(html).not.toContain('more)');
  });

  it('renders one TP row per TP code, with rosterMaster.name and the roster count', async () => {
    externalIds.forRace.mockResolvedValue({
      bbl: [],
      tp: ['dwarf', 'dwarf2'],
      name: [],
    });
    tp.raceFor.mockImplementation((code: string) =>
      Promise.resolve({
        teamRaceCode: code,
        rosterName: `Dwarf (${code})`,
        rosterCount: 3,
        positions: [],
      }),
    );

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    expect(html).toContain('Dwarf (dwarf)');
    expect(html).toContain('Dwarf (dwarf2)');
    expect(html.match(/<td>3<\/td>/g)?.length).toBe(2);
  });

  it('renders a TP row with an explanatory note when no roster file carries that code', async () => {
    externalIds.forRace.mockResolvedValue({
      bbl: [],
      tp: ['ghost'],
      name: [],
    });
    tp.raceFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    expect(html).toContain('ghost');
    expect(html).toContain('no roster file carries this code');
  });

  it('falls back to an em-dash for a TP row when rosterMaster.name is absent', async () => {
    externalIds.forRace.mockResolvedValue({
      bbl: [],
      tp: ['dwarf'],
      name: [],
    });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf',
      rosterName: null,
      rosterCount: 3,
      positions: [],
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    expect(html).toContain('<td>—</td>');
  });

  it('skips a null BBL/TP entry when finding the first name for the agreement row', async () => {
    externalIds.forRace.mockResolvedValue({
      bbl: ['1', '2'],
      tp: ['a', 'b'],
      name: [],
    });
    bbl.raceFor.mockImplementation((id: string) =>
      Promise.resolve(
        id === '1'
          ? null
          : {
              bblId: id,
              listName: 'Dwarf Team',
              teamPageName: 'Dwarf Team',
              teamPageCount: 1,
              teamCodes: [],
            },
      ),
    );
    tp.raceFor.mockImplementation((code: string) =>
      Promise.resolve(
        code === 'a'
          ? null
          : {
              teamRaceCode: code,
              rosterName: 'Dwarf',
              rosterCount: 1,
              positions: [],
            },
      ),
    );

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL / TP name agreement</h5>');
    expect(html).toContain('agree');
    expect(html).not.toContain('MISMATCH');
  });

  it('renders the Manual curation sub-section listing the curated entry name and system:id pairs', async () => {
    externalIds.allForRace.mockResolvedValue([
      { systemName: 'BBL', externalId: '5' },
    ]);
    manual.races.mockResolvedValue([
      { name: 'Dwarf', externalIds: [{ system: 'BBL', id: '5' }] },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<h5>Manual curation</h5>');
    expect(html).toContain('Dwarf');
    expect(html).toContain('BBL: 5');
  });

  it('omits Manual curation when no curated entry matches by external id or name', async () => {
    externalIds.allForRace.mockResolvedValue([
      { systemName: 'BBL', externalId: '5' },
    ]);
    manual.races.mockResolvedValue([
      { name: 'Orc', externalIds: [{ system: 'BBL', id: '99' }] },
    ]);

    const html = await service.render(race);

    expect(html).not.toContain('<h5>Manual curation</h5>');
  });

  it('renders a non-highlighted agreement row when BBL and TP names agree after suffix stripping', async () => {
    externalIds.forRace.mockResolvedValue({
      bbl: ['5'],
      tp: ['dwarf'],
      name: [],
    });
    bbl.raceFor.mockResolvedValue({
      bblId: '5',
      listName: 'Dwarf Team',
      teamPageName: 'Dwarf Team',
      teamPageCount: 1,
      teamCodes: [],
    });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf',
      rosterName: 'Dwarf',
      rosterCount: 1,
      positions: [],
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL / TP name agreement</h5>');
    expect(html).toContain('agree');
    expect(html).not.toContain('MISMATCH');
    expect(html).not.toContain('class="mismatch"');
  });

  it('renders a highlighted MISMATCH agreement row when names genuinely disagree', async () => {
    externalIds.forRace.mockResolvedValue({
      bbl: ['9'],
      tp: ['woodelf'],
      name: [],
    });
    bbl.raceFor.mockResolvedValue({
      bblId: '9',
      listName: 'Elven Union Team',
      teamPageName: 'Elven Union Team',
      teamPageCount: 1,
      teamCodes: [],
    });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'woodelf',
      rosterName: 'Wood Elf',
      rosterCount: 1,
      positions: [],
    });

    const html = await service.render(race);

    expect(html).toContain('MISMATCH');
    expect(html).toContain('class="mismatch"');
  });

  it('omits the agreement table when either side has no name', async () => {
    externalIds.forRace.mockResolvedValue({ bbl: ['5'], tp: [], name: [] });
    bbl.raceFor.mockResolvedValue({
      bblId: '5',
      listName: 'Dwarf Team',
      teamPageName: 'Dwarf Team',
      teamPageCount: 1,
      teamCodes: [],
    });

    const html = await service.render(race);

    expect(html).not.toContain('name agreement');
  });

  it('renders a single note when no source has anything for the race', async () => {
    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No raw data for race &quot;Dwarf&quot; in BBL, TP or the curated files.</p>',
    );
  });
});
