import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPositionTypIdsService } from '../shared/bbl-position-typ-ids.service';
import { PositionExternalIdsService } from '../shared/position-external-ids.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { BblRawPositionPageService } from '../source/bbl-raw-position-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawOfficialTeamsIndexService } from '../source/tp-raw-official-teams-index.service';
import { TpSkillMasterNamesService } from '../source/tp-skill-master-names.service';
import { PositionStartingSkillsRawRendererService } from './position-starting-skills-raw-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('PositionStartingSkillsRawRendererService', () => {
  let service: PositionStartingSkillsRawRendererService;
  let query: MockProxy<RacePositionsQueryService>;
  let positionIds: MockProxy<PositionExternalIdsService>;
  let raceIds: MockProxy<RaceExternalIdsService>;
  let bbl: MockProxy<BblRawPositionPageService>;
  let tp: MockProxy<TpRawOfficialTeamsIndexService>;
  let manual: MockProxy<ManualRawDataService>;
  let typIds: MockProxy<BblPositionTypIdsService>;
  let masters: MockProxy<TpSkillMasterNamesService>;

  beforeEach(async () => {
    query = mock<RacePositionsQueryService>();
    positionIds = mock<PositionExternalIdsService>();
    raceIds = mock<RaceExternalIdsService>();
    bbl = mock<BblRawPositionPageService>();
    tp = mock<TpRawOfficialTeamsIndexService>();
    manual = mock<ManualRawDataService>();
    typIds = mock<BblPositionTypIdsService>();
    masters = mock<TpSkillMasterNamesService>();
    query.positionsFor.mockResolvedValue([]);
    positionIds.forPositions.mockResolvedValue(new Map());
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: [], name: [] });
    manual.positionSkills.mockResolvedValue([]);
    typIds.forRace.mockResolvedValue(new Map());
    masters.masterFor.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionStartingSkillsRawRendererService,
        { provide: RacePositionsQueryService, useValue: query },
        { provide: PositionExternalIdsService, useValue: positionIds },
        { provide: RaceExternalIdsService, useValue: raceIds },
        { provide: BblRawPositionPageService, useValue: bbl },
        { provide: TpRawOfficialTeamsIndexService, useValue: tp },
        { provide: ManualRawDataService, useValue: manual },
        { provide: BblPositionTypIdsService, useValue: typIds },
        { provide: TpSkillMasterNamesService, useValue: masters },
        HtmlService,
        SkillFormatService,
      ],
    }).compile();
    service = moduleRef.get(PositionStartingSkillsRawRendererService);
  });

  it("lists each stored position's BBL starting skills", async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue({
      typId: '310',
      name: 'Dwarf Blitzer',
      isStarPlayer: false,
      races: [],
      characteristics: null,
      skills: [
        { name: 'Block', attributeValue: null },
        { name: 'Loner', attributeValue: '4+' },
      ],
    });

    const html = await service.render(race);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain(
      '<td>Blitzer</td><td>310</td><td>Block, Loner (4+)</td>',
    );
  });

  it('shows a BBL position with an empty skills cell as having none', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Lineman', '311']]));
    bbl.positionFor.mockResolvedValue({
      typId: '311',
      name: 'Dwarf Lineman',
      isStarPlayer: false,
      races: [],
      characteristics: null,
      skills: [],
    });

    const html = await service.render(race);

    expect(html).toContain('<td>Lineman</td><td>311</td><td>none</td>');
  });

  it('highlights a BBL position whose page is not in the mirror', async () => {
    typIds.forRace.mockResolvedValue(new Map([['Blitzer', '310']]));
    bbl.positionFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('page not in the mirror');
  });

  it('resolves TP skill master ids to their names', async () => {
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf-20'], name: [] });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf-20',
      raceName: 'Dwarf',
      rulesSets: ['BB2020'],
      positions: [
        {
          name: 'Blitzer',
          isStar: false,
          isOfficial: true,
          rulesSet: 'BB2020',
          tpPositionId: 1,
          characteristics: {
            move: 6,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 9,
          },
          skills: [{ skillMasterId: 220, attributeValue: null }],
          specialRuleName: null,
        },
      ],
    });
    masters.masterFor.mockResolvedValue({ name: 'Block', isElite: true });

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    // Elite is a gained-skill concept: a starting skill never carries the
    // marker, even where TP flags the skill itself as elite.
    expect(html).toContain('<td>Blitzer</td><td>BB2020</td><td>Block</td>');
  });

  it('shows an unresolvable TP skill master id as such', async () => {
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf-20'], name: [] });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf-20',
      raceName: 'Dwarf',
      rulesSets: ['BB2020'],
      positions: [
        {
          name: 'Blitzer',
          isStar: false,
          isOfficial: true,
          rulesSet: 'BB2020',
          tpPositionId: 1,
          characteristics: {
            move: 6,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 9,
          },
          skills: [{ skillMasterId: 999, attributeValue: '4+' }],
          specialRuleName: null,
        },
      ],
    });

    const html = await service.render(race);

    expect(html).toContain('skill master #999 (4+)');
  });

  it('lists curated starting skills for a position matched by its Name id', async () => {
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
    manual.positionSkills.mockResolvedValue([
      {
        position: { system: 'Name', id: 'Dwarf: Blitzer' },
        rulesSet: { system: 'Name', id: 'CRP' },
        skills: [{ system: 'Name', id: 'Block' }],
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<h5>Manual curation</h5>');
    expect(html).toContain('<td>Blitzer</td><td>CRP</td><td>Block</td>');
  });

  it('renders a note when no source has starting skills for the race', async () => {
    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No raw starting-skill data for race &quot;Dwarf&quot;.</p>',
    );
  });
});
